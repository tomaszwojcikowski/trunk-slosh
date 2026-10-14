import { AudioBus, rollGainFor } from "../audio/AudioBus";
import { airborneMix } from "../audio/airborneMix";
import { lipAccentGain, sloshCutoffFor } from "../audio/cargoVoice";
import { musicMixFor, nearMissFor } from "../audio/dynamicMusic";
import { Input } from "../input/Input";
import type { Vec2 } from "../math/vec2";
import { FluidLayer } from "../physics/FluidLayer";
import { FluidWorkerClient } from "../physics/fluidWorkerClient";
import { ParticlePool, type SpillEvent } from "../physics/Particles";
import { TRUNK_LIP_HEIGHT } from "../physics/trunkConstants";
import {
	type DriveInput,
	VehicleSimulation,
	type VehicleSnapshot,
} from "../physics/VehicleSimulation";
import { applyVehiclePreset } from "../physics/vehiclePresets";
import { settlePitch } from "../physics/wheelPitch";
import { decayPunch, decayShake, punchZoom } from "../render/cameraMotion";
import { chasePoint, followChase } from "../render/chaseCamera";
import {
	captureGrain,
	createPresenter,
	type Presenter,
} from "../render/InkPost";
import { type Camera, Renderer } from "../render/Renderer";
import { TrunkIsoView } from "../render/TrunkIsoView";
import { resolveArchetype, Track } from "../world/Track";
import {
	achievementLabel,
	loadAchievements,
	unlockAchievements,
} from "./achievements";
import { bendTarget } from "./bendAim";
import { type CargoThreat, cargoThreatLevel } from "./cargoThreat";
import { demoDrive } from "./demoDrive";
import { GhostRunner, ghostMatches } from "./ghost";
import { ghostSplitLabel } from "./ghostSplit";
import {
	exportGooJson,
	type GooFile,
	gooFromCargo,
	loadStoredGoo,
	parseGoo,
	saveStoredGoo,
} from "./goo";
import { airborneLabel, gradeLabel } from "./gradeRead";
import { DISCUSSIONS_URL, scoreBlurb } from "./leaderboard";
import { liveAnnouncement } from "./liveAnnounce";
import { modeBlurb } from "./modeBlurb";
import {
	loadGhostRecording,
	maybeSaveBest,
	saveGhostRecording,
} from "./persistence";
import { ReplayRecorder } from "./replay";
import { reviewJuiceInput } from "./reviewDrive";
import {
	CONTRACT_ABORT_RATIO,
	finishCargoFloor,
	parseRunConfig,
	type RunConfig,
	runConfigToQuery,
} from "./runConfig";
import { RunStats } from "./runStats";
import {
	detectDefaultQuality,
	type GameSettings,
	hatchLevelForQuality,
	loadSettings,
	saveSettings,
} from "./settings";
import { deliverShareCard, paintShareCard } from "./shareCard";
import {
	nextSloshBand,
	type SloshBand,
	sloshFill,
	sloshLevel,
} from "./sloshMeter";
import { nextTutorialHint, tutorialMessage } from "./tutorials";

const FIXED_DT = 1 / 120;
const MAX_STEPS = 10;
const HATCH_PERIOD = 7;

type Phase = "ready" | "driving" | "finished" | "failed";

type Hud = {
	liquid: HTMLElement;
	liquidBar: HTMLElement;
	speed: HTMLElement;
	time: HTMLElement;
	progress: HTMLElement;
	checkpoint: HTMLElement;
	seed: HTMLElement;
	g: HTMLElement;
	grade: HTMLElement;
	air: HTMLElement;
	slosh: HTMLElement;
	sloshBar: HTMLElement;
	intro: HTMLElement;
	result: HTMLElement;
	fail: HTMLElement;
	resultKept: HTMLElement;
	resultTime: HTMLElement;
	resultGrade: HTMLElement;
	resultQuip: HTMLElement;
	resultStats: HTMLElement;
	resultBest: HTMLElement;
	resultSeed: HTMLElement;
	resultAchievements: HTMLElement;
	introSeed: HTMLElement;
	ghost: HTMLElement;
	ghostSplit: HTMLElement;
	live: HTMLElement;
	tutorial: HTMLElement;
	settingsPanel: HTMLElement;
	pausePanel: HTMLElement;
	modeBlurb: HTMLElement;
	ink: HTMLElement;
	trunkIso: HTMLElement;
	pauseBtn: HTMLElement;
};

function grade(kept: number): { letter: string; quip: string } {
	if (kept >= 0.97)
		return { letter: "S", quip: "Not a single drop. Legendary loot." };
	if (kept >= 0.9)
		return { letter: "A", quip: "Smooth operator. The client barely noticed." };
	if (kept >= 0.75)
		return { letter: "B", quip: "Some sloshing. Nothing a mop can’t fix." };
	if (kept >= 0.5)
		return { letter: "C", quip: "Half the cargo is now desert decoration." };
	return { letter: "D", quip: "The trunk is mostly vibes at this point." };
}

const fmtTime = (t: number) => {
	const m = Math.floor(t / 60);
	const s = t - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

export class Game {
	private track: Track;
	private readonly vehicle = new VehicleSimulation();
	private readonly fluid = new FluidLayer();
	private readonly particles = new ParticlePool();
	private readonly renderer = new Renderer();
	private readonly trunkIso: TrunkIsoView;
	private readonly trunkIsoPopout: TrunkIsoView;
	private readonly popoutEl: HTMLElement;
	private popoutOpen = false;
	private readonly presenter: Presenter;
	private readonly input: Input;
	private readonly hud: Hud;
	private readonly wrap: HTMLElement;

	private phase: Phase = "ready";
	private elapsed = 0;
	private clock = 0;
	private last = performance.now();
	private accum = 0;
	private camera: Camera = { x: 0, y: 0, zoom: 11 };
	private shake = 0;
	private inkEnabled = true;
	private debug = false;
	private lastWheel: (Vec2 | null)[] = [null, null, null, null];
	private spillWindow = 0;
	private spillTimer = 0;
	private hudCache = new Map<HTMLElement, string>();
	private readonly demo = new URLSearchParams(window.location.search).has(
		"demo",
	);
	private readonly review =
		new URLSearchParams(window.location.search).get("review") === "juice";
	private runConfig: RunConfig;
	private settings: GameSettings;
	private readonly stats = new RunStats();
	private readonly replay = new ReplayRecorder();
	private readonly ghost = new GhostRunner();
	private lastShare: {
		grade: string;
		kept: number;
		timeLabel: string;
		detail: string;
	} | null = null;
	private readonly fluidWorker: FluidWorkerClient;
	private readonly audio = new AudioBus();
	private paused = false;
	private punch = 0;
	private lastSpillVol = 0;
	private pitchSettle = { pitch: 0, velocity: 0 };
	private hudSloshBand: SloshBand = "calm";
	private cargoThreat: CargoThreat = "ok";
	constructor(
		canvas: HTMLCanvasElement,
		isoCanvas: HTMLCanvasElement,
		isoLargeCanvas: HTMLCanvasElement,
		root: HTMLElement,
	) {
		this.wrap = root;
		this.presenter = createPresenter(canvas);
		this.trunkIso = new TrunkIsoView(isoCanvas);
		this.trunkIsoPopout = new TrunkIsoView(isoLargeCanvas);
		this.popoutEl = root.querySelector("#trunk-iso-popout")!;
		this.fluidWorker = new FluidWorkerClient(this.fluid);
		this.runConfig = parseRunConfig(
			new URLSearchParams(window.location.search),
		);
		this.settings = loadSettings();
		if (this.settings.quality === "high" && detectDefaultQuality() !== "high") {
			this.settings.quality = detectDefaultQuality();
		}
		this.input = new Input(root);
		this.hud = {
			liquid: root.querySelector("#hud-liquid")!,
			liquidBar: root.querySelector("#hud-liquid-bar")!,
			speed: root.querySelector("#hud-speed")!,
			time: root.querySelector("#hud-time")!,
			progress: root.querySelector("#hud-progress")!,
			checkpoint: root.querySelector("#hud-checkpoint")!,
			seed: root.querySelector("#hud-seed")!,
			g: root.querySelector("#hud-g")!,
			grade: root.querySelector("#hud-grade")!,
			air: root.querySelector("#hud-air")!,
			slosh: root.querySelector("#hud-slosh")!,
			sloshBar: root.querySelector("#hud-slosh-bar")!,
			intro: root.querySelector("#overlay-intro")!,
			result: root.querySelector("#overlay-result")!,
			fail: root.querySelector("#overlay-fail")!,
			resultKept: root.querySelector("#result-kept")!,
			resultTime: root.querySelector("#result-time")!,
			resultGrade: root.querySelector("#result-grade")!,
			resultQuip: root.querySelector("#result-quip")!,
			resultStats: root.querySelector("#result-stats")!,
			resultBest: root.querySelector("#result-best")!,
			resultSeed: root.querySelector("#result-seed")!,
			resultAchievements: root.querySelector("#result-achievements")!,
			introSeed: root.querySelector("#intro-seed")!,
			ghost: root.querySelector("#hud-ghost")!,
			ghostSplit: root.querySelector("#hud-ghost-split")!,
			live: root.querySelector("#hud-live")!,
			tutorial: root.querySelector("#tutorial-toast")!,
			settingsPanel: root.querySelector("#overlay-settings")!,
			pausePanel: root.querySelector("#overlay-pause")!,
			modeBlurb: root.querySelector("#intro-mode-blurb")!,
			ink: root.querySelector("#btn-ink")!,
			trunkIso: root.querySelector("#btn-trunk-iso")!,
			pauseBtn: root.querySelector("#btn-pause")!,
		};
		if (this.presenter.kind === "2d") this.hud.ink.hidden = true;

		this.input.onAction((a) => {
			if (a === "restart") this.resetRun();
			else if (a === "newTrack") this.newTrack();
			else if (a === "toggleInk") this.toggleInk();
			else if (a === "toggleDebug") this.debug = !this.debug;
			else if (a === "toggleTrunkIso") this.toggleTrunkIso();
			else if (a === "pause") this.togglePause();
			else if (a === "toggleSettings") this.toggleSettings();
		});
		root
			.querySelectorAll<HTMLButtonElement>('[data-action="restart"]')
			.forEach((b) => b.addEventListener("click", () => this.resetRun()));
		root
			.querySelectorAll<HTMLButtonElement>('[data-action="new-track"]')
			.forEach((b) => b.addEventListener("click", () => this.newTrack()));
		root
			.querySelectorAll<HTMLButtonElement>('[data-action="resume"]')
			.forEach((b) =>
				b.addEventListener("click", () => this.resumeFromPause()),
			);
		this.hud.ink.addEventListener("click", () => this.toggleInk());
		this.hud.trunkIso.addEventListener("click", () => this.toggleTrunkIso());
		root.querySelector("#trunk-iso-panel")?.addEventListener("click", () => {
			if (this.trunkIso.visible) this.setPopoutOpen(!this.popoutOpen);
		});
		root
			.querySelector('[data-action="close-trunk-popout"]')
			?.addEventListener("click", () => this.setPopoutOpen(false));
		this.popoutEl.addEventListener("click", (e) => {
			if (e.target === this.popoutEl) this.setPopoutOpen(false);
		});
		window.addEventListener("keydown", (e) => {
			if (e.code === "Escape" && this.popoutOpen) {
				this.setPopoutOpen(false);
				return;
			}
			if (e.code === "Escape" && !this.hud.settingsPanel.hidden) {
				this.toggleSettings(false);
				return;
			}
			if (e.code === "Escape" && !this.hud.pausePanel.hidden)
				this.resumeFromPause();
		});
		const armAudio = () => this.audio.unlock();
		window.addEventListener("pointerdown", armAudio);
		window.addEventListener("keydown", armAudio);
		window.addEventListener("blur", () => {
			if (this.phase === "driving") this.pauseRun();
		});
		this.bindIntroControls(root);
		this.bindSettings(root);
		this.hud.pauseBtn.addEventListener("click", () => this.togglePause());

		window.addEventListener("resize", () => this.onResize());
		this.applySettingsToRuntime();
		this.track = this.buildTrack();
		this.syncSeedHud();
		void this.fluidWorker.init(
			this.runConfig.cargo,
			this.settings.useFluidWorker || this.runConfig.useFluidWorker,
		);
		this.resetRun();
		this.onResize();
		const warmup = Number(
			new URLSearchParams(window.location.search).get("demo"),
		);
		if (this.review) {
			for (let t = 0; t < 2.15; t += FIXED_DT) this.simulate(FIXED_DT);
			this.paused = true;
			this.syncPauseUi();
		} else if (this.demo && warmup > 0) {
			for (let t = 0; t < Math.min(warmup, 120); t += FIXED_DT)
				this.simulate(FIXED_DT);
		}
		if (this.demo || this.review) {
			const snap = this.vehicle.snapshot();
			const chase = chasePoint(snap.pos, snap.vel);
			this.camera = {
				x: chase.x,
				y: chase.y,
				zoom: this.targetZoom(snap.speed),
			};
		}
		requestAnimationFrame((t) => this.frame(t));
	}

	private randomSeed() {
		return Math.floor(Math.random() * 1e9);
	}

	private buildTrack(seed = this.runConfig.seed) {
		return new Track(seed, {
			difficulty: this.runConfig.difficulty,
			archetype: this.runConfig.archetype,
		});
	}

	private activeGoo(): GooFile | null {
		if (!this.runConfig.customGoo) return null;
		return loadStoredGoo();
	}

	private syncSeedHud() {
		const goo = this.activeGoo();
		const label = this.runConfig.daily
			? `Daily ${this.runConfig.seed}`
			: `Seed ${this.runConfig.seed}`;
		const text = goo ? `${label} · ${goo.name}` : label;
		this.setText(this.hud.seed, text);
		this.setText(this.hud.introSeed, text);
		this.hud.ghost.hidden = !this.ghost.active;
	}

	private applySettingsToRuntime() {
		this.inkEnabled = this.settings.ink;
		this.audio.enabled = this.settings.sfx;
		this.audio.music = this.settings.music;
		this.audio.volume = this.settings.masterVolume;
		this.input.keyboardRampMul = this.settings.keyboardRamp;
		this.input.touchSensitivityMul = this.settings.touchSensitivity;
		this.hud.ink.textContent = this.inkEnabled ? "Ink: on" : "Ink: off";
		this.trunkIso.visible = true;
		this.syncAudioDuck();
	}

	private syncAudioDuck() {
		const duck =
			this.paused || this.phase === "finished" || this.phase === "failed";
		this.audio.setDucked(duck);
	}

	private bindIntroControls(root: HTMLElement) {
		const modeSel = root.querySelector<HTMLSelectElement>("#select-mode")!;
		const diffSel =
			root.querySelector<HTMLSelectElement>("#select-difficulty")!;
		const cargoSel = root.querySelector<HTMLSelectElement>("#select-cargo")!;
		const vehSel = root.querySelector<HTMLSelectElement>("#select-vehicle")!;
		const archSel = root.querySelector<HTMLSelectElement>("#select-archetype")!;
		modeSel.value = this.runConfig.mode;
		diffSel.value = this.runConfig.difficulty;
		cargoSel.value = this.runConfig.cargo;
		vehSel.value = this.runConfig.vehicle;
		archSel.value = this.runConfig.archetype;
		const syncModeBlurb = () => {
			this.hud.modeBlurb.textContent = modeBlurb(this.runConfig.mode);
		};
		const apply = () => {
			this.runConfig.mode = modeSel.value as RunConfig["mode"];
			this.runConfig.difficulty = diffSel.value as RunConfig["difficulty"];
			this.runConfig.cargo = cargoSel.value as RunConfig["cargo"];
			this.runConfig.vehicle = vehSel.value as RunConfig["vehicle"];
			this.runConfig.archetype = archSel.value as RunConfig["archetype"];
			history.replaceState(null, "", `?${runConfigToQuery(this.runConfig)}`);
			this.track = this.buildTrack();
			syncModeBlurb();
			this.resetRun();
		};
		for (const el of [modeSel, diffSel, cargoSel, vehSel, archSel])
			el.addEventListener("change", apply);
		syncModeBlurb();
		root
			.querySelector('[data-action="daily-seed"]')
			?.addEventListener("click", () => {
				this.runConfig.daily = true;
				this.runConfig.seed = parseRunConfig(
					new URLSearchParams("daily=1"),
				).seed;
				history.replaceState(null, "", `?${runConfigToQuery(this.runConfig)}`);
				this.track = this.buildTrack();
				this.syncSeedHud();
				this.resetRun();
			});
	}

	private bindSettings(root: HTMLElement) {
		const ink = root.querySelector<HTMLInputElement>("#set-ink")!;
		const sfx = root.querySelector<HTMLInputElement>("#set-sfx")!;
		const music = root.querySelector<HTMLInputElement>("#set-music")!;
		const volume = root.querySelector<HTMLInputElement>("#set-volume")!;
		const motion = root.querySelector<HTMLInputElement>("#set-motion")!;
		const punch = root.querySelector<HTMLInputElement>("#set-punch")!;
		const quality = root.querySelector<HTMLSelectElement>("#set-quality")!;
		const worker = root.querySelector<HTMLInputElement>("#set-worker")!;
		const touch = root.querySelector<HTMLInputElement>("#set-touch")!;
		const ramp = root.querySelector<HTMLInputElement>("#set-ramp")!;
		const sync = () => {
			ink.checked = this.settings.ink;
			sfx.checked = this.settings.sfx;
			music.checked = this.settings.music;
			volume.value = String(this.settings.masterVolume);
			motion.checked = this.settings.reducedMotion;
			punch.checked = this.settings.cameraPunch;
			quality.value = this.settings.quality;
			worker.checked = this.settings.useFluidWorker;
			touch.value = String(this.settings.touchSensitivity);
			ramp.value = String(this.settings.keyboardRamp);
		};
		root
			.querySelector('[data-action="open-settings"]')
			?.addEventListener("click", () => this.toggleSettings(true));
		root
			.querySelectorAll('[data-action="close-settings"]')
			.forEach((b) =>
				b.addEventListener("click", () => this.toggleSettings(false)),
			);
		root
			.querySelector('[data-action="clear-storage"]')
			?.addEventListener("click", () => {
				localStorage.clear();
				saveSettings(this.settings);
				this.ghost.load(null);
				this.renderAchievementList();
				this.syncSeedHud();
			});
		root
			.querySelector('[data-action="export-replay"]')
			?.addEventListener("click", () => {
				this.downloadJson(
					this.replay.toJson(this.runConfig),
					`trunk-slosh-replay-${this.runConfig.seed}.json`,
				);
			});
		root
			.querySelector('[data-action="export-goo"]')
			?.addEventListener("click", () => {
				const active = this.activeGoo() ?? gooFromCargo(this.runConfig.cargo);
				this.downloadJson(exportGooJson(active), "trunk-slosh-goo.json");
			});
		const gooFile = root.querySelector<HTMLInputElement>("#goo-file");
		root
			.querySelector('[data-action="import-goo"]')
			?.addEventListener("click", () => {
				gooFile?.click();
			});
		gooFile?.addEventListener("change", () => {
			const file = gooFile.files?.[0];
			if (!file) return;
			void file.text().then((text) => {
				try {
					const goo = parseGoo(JSON.parse(text) as unknown);
					if (!goo) return;
					saveStoredGoo(goo);
					this.runConfig.customGoo = true;
					history.replaceState(
						null,
						"",
						`?${runConfigToQuery(this.runConfig)}`,
					);
					this.resetRun();
				} catch {
					// Leave the current goo alone when the file is not JSON.
				}
			});
		});
		root
			.querySelector('[data-action="share-card"]')
			?.addEventListener("click", () => {
				void this.shareResult();
			});
		root
			.querySelector('[data-action="post-score"]')
			?.addEventListener("click", () => {
				void this.copyScorePost();
			});
		this.renderAchievementList();
		const save = () => {
			this.settings.ink = ink.checked;
			this.settings.sfx = sfx.checked;
			this.settings.music = music.checked;
			this.settings.masterVolume = Number(volume.value);
			this.settings.reducedMotion = motion.checked;
			this.settings.cameraPunch = punch.checked;
			this.settings.quality = quality.value as GameSettings["quality"];
			this.settings.useFluidWorker = worker.checked;
			this.settings.touchSensitivity = Number(touch.value);
			this.settings.keyboardRamp = Number(ramp.value);
			saveSettings(this.settings);
			this.applySettingsToRuntime();
			this.audio.unlock();
			void this.fluidWorker.init(
				this.runConfig.cargo,
				this.settings.useFluidWorker,
			);
		};
		for (const el of [
			ink,
			sfx,
			music,
			volume,
			motion,
			punch,
			quality,
			worker,
			touch,
			ramp,
		])
			el.addEventListener("change", save);
		volume.addEventListener("input", save);
		sync();
	}

	private toggleSettings(open?: boolean) {
		const nextVisible =
			open !== undefined ? open : this.hud.settingsPanel.hidden;
		this.hud.settingsPanel.hidden = !nextVisible;
	}

	private togglePause() {
		if (this.phase !== "driving") return;
		if (this.paused) this.resumeFromPause();
		else this.pauseRun();
	}

	private pauseRun() {
		if (this.phase !== "driving" || this.paused) return;
		this.paused = true;
		this.audio.idle();
		this.syncAudioDuck();
		this.syncPauseUi();
	}

	private resumeFromPause() {
		if (!this.paused) return;
		this.paused = false;
		this.hud.pausePanel.hidden = true;
		this.syncAudioDuck();
		this.syncPauseUi();
	}

	private syncPauseUi() {
		this.hud.pauseBtn.textContent = this.paused ? "Resume" : "Pause";
		const showPauseCard =
			this.paused && this.phase === "driving" && this.hud.intro.hidden;
		this.hud.pausePanel.hidden = !showPauseCard;
	}

	private newTrack() {
		if (!this.runConfig.daily) {
			this.runConfig.seed = this.randomSeed();
			history.replaceState(null, "", `?${runConfigToQuery(this.runConfig)}`);
		}
		this.track = this.buildTrack();
		this.syncSeedHud();
		this.resetRun();
	}

	private toggleInk() {
		this.settings.ink = !this.settings.ink;
		saveSettings(this.settings);
		this.applySettingsToRuntime();
	}

	private toggleTrunkIso() {
		this.trunkIso.visible = !this.trunkIso.visible;
		this.hud.trunkIso.textContent = this.trunkIso.visible
			? "Tub 3D: on"
			: "Tub 3D: off";
		this.wrap
			.querySelector("#trunk-iso-panel")
			?.classList.toggle("hidden", !this.trunkIso.visible);
		if (!this.trunkIso.visible) this.setPopoutOpen(false);
	}

	private setPopoutOpen(open: boolean) {
		this.popoutOpen = open;
		this.popoutEl.hidden = !open;
		if (open) this.resizePopout();
	}

	private resizePopout() {
		const w = Math.min(520, this.wrap.clientWidth * 0.92);
		const h = Math.min(420, this.wrap.clientHeight * 0.72);
		const pr = Math.min(window.devicePixelRatio || 1, 2);
		this.trunkIsoPopout.resize(w, h, pr);
	}

	private downloadJson(text: string, filename: string) {
		const blob = new Blob([text], { type: "application/json" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = filename;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	private renderAchievementList() {
		const list = this.wrap.querySelector<HTMLElement>("#achievement-list");
		if (!list) return;
		const owned = new Set(loadAchievements());
		list.replaceChildren(
			...[...owned].map((id) => {
				const li = document.createElement("li");
				li.textContent = achievementLabel(id);
				return li;
			}),
		);
		if (owned.size === 0) {
			const li = document.createElement("li");
			li.textContent = "None yet — finish a run.";
			list.append(li);
		}
	}

	private shareUrl(): string {
		const q = runConfigToQuery(this.runConfig);
		return `${location.origin}${location.pathname}${q ? `?${q}` : ""}`;
	}

	private async shareResult() {
		const last = this.lastShare;
		if (!last) return;
		const canvas = document.createElement("canvas");
		canvas.width = 900;
		canvas.height = 1200;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const url = this.shareUrl();
		paintShareCard(ctx, canvas.width, canvas.height, {
			grade: last.grade,
			keptLabel: `${(last.kept * 100).toFixed(0)}%`,
			timeLabel: last.timeLabel,
			seedLabel: this.runConfig.daily
				? `Daily ${this.runConfig.seed}`
				: `Seed ${this.runConfig.seed}`,
			detail: last.detail,
			url,
		});
		await deliverShareCard(
			canvas,
			`trunk-slosh-${this.runConfig.seed}.png`,
			scoreBlurb(this.runConfig, last.grade, last.kept, last.timeLabel, url),
		);
	}

	private async copyScorePost() {
		const last = this.lastShare;
		if (!last) return;
		const text = scoreBlurb(
			this.runConfig,
			last.grade,
			last.kept,
			last.timeLabel,
			this.shareUrl(),
		);
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard can be blocked; the discussions page is still the board.
		}
		window.open(DISCUSSIONS_URL, "_blank", "noopener");
	}

	private resetRun() {
		applyVehiclePreset(this.runConfig.vehicle);
		this.vehicle.reset(this.track);
		const goo = this.activeGoo();
		if (goo) this.fluid.applyGoo(goo);
		else {
			this.fluid.reset();
			this.fluid.setCargoPreset(this.runConfig.cargo);
		}
		this.fluidWorker.invalidate();
		this.particles.clear();
		this.stats.reset();
		this.replay.clear();
		const stored = this.runConfig.customGoo
			? null
			: loadGhostRecording(
					this.runConfig.mode,
					this.runConfig.seed,
					this.runConfig.daily,
					this.runConfig.difficulty,
				);
		this.ghost.load(
			stored && ghostMatches(stored, this.runConfig) ? stored : null,
		);
		this.ghost.reset(this.track, this.runConfig.cargo, this.activeGoo());
		this.phase = "ready";
		this.paused = false;
		this.elapsed = 0;
		this.accum = 0;
		this.shake = 0;
		this.punch = 0;
		this.pitchSettle = { pitch: 0, velocity: 0 };
		this.hudSloshBand = "calm";
		this.cargoThreat = "ok";
		this.spillWindow = 0;
		this.lastSpillVol = this.fluid.spilledVolume;
		this.lastWheel = [null, null, null, null];
		const parked = chasePoint(this.track.start, { x: 0, y: 0 });
		this.camera = {
			x: parked.x,
			y: parked.y,
			zoom: this.targetZoom(0),
		};
		this.hud.intro.hidden = false;
		this.hud.result.hidden = true;
		this.hud.fail.hidden = true;
		this.hud.pausePanel.hidden = true;
		this.hud.tutorial.hidden = true;
		this.hud.live.textContent = "";
		this.hud.ghostSplit.hidden = true;
		this.syncAudioDuck();
		this.syncPauseUi();
		this.syncSeedHud();
	}

	private onResize() {
		const w = Math.max(1, this.wrap.clientWidth);
		const h = Math.max(1, this.wrap.clientHeight);
		const coarse = window.matchMedia("(pointer: coarse)").matches;
		let pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.75);
		const budget = coarse ? 1.6e6 : 2.6e6;
		if (w * h * pr * pr > budget) pr = Math.sqrt(budget / (w * h));
		this.renderer.resize(w, h, pr);
		this.presenter.resize(
			this.renderer.canvas.width,
			this.renderer.canvas.height,
		);
		const isoW = coarse ? Math.min(168, w * 0.42) : 220;
		const isoH = coarse ? Math.min(136, h * 0.22) : 180;
		this.trunkIso.resize(isoW, isoH, Math.min(pr, coarse ? 1.5 : 2));
		if (this.popoutOpen) this.resizePopout();
	}

	private targetZoom(speed: number) {
		const minDim =
			Math.min(this.wrap.clientWidth, this.wrap.clientHeight) || 600;
		// Larger divisor → smaller zoom → more road ahead of the truck.
		return minDim / (22 + speed * 0.55);
	}

	/** Lookahead pursuit along the centerline; powers the `?demo` attract mode. */
	private autopilot(): DriveInput {
		const snap = this.vehicle.snapshot();
		return demoDrive(this.track, snap.pos, snap.angle, snap.speed);
	}

	private simulate(dt: number) {
		if (this.paused && this.phase === "driving") {
			this.audio.idle();
			this.syncAudioDuck();
			return;
		}

		const drive = this.review
			? reviewJuiceInput(this.elapsed)
			: this.phase === "finished" || this.phase === "failed"
				? {
						throttle: this.vehicle.snapshot().speed > 0.5 ? -0.5 : 0,
						steer: 0,
					}
				: this.demo
					? this.autopilot()
					: this.input.poll(dt);
		if (
			this.phase === "ready" &&
			(this.input.engaged || this.demo || this.review)
		) {
			this.phase = "driving";
			this.hud.intro.hidden = true;
			this.audio.unlock();
		}

		this.vehicle.step(dt, drive, this.track, this.fluid);
		const spills = this.fluidWorker.step(
			dt,
			this.vehicle.fluidFrame(),
			!this.runConfig.customGoo,
		);
		const spillDelta = (this.fluid.spilledVolume - this.lastSpillVol) * 1000;
		this.lastSpillVol = this.fluid.spilledVolume;
		if (spills.length)
			this.emitSpills(
				spills.map((s) => this.toWorldSpill(s.local, s.relVel, s.volume)),
			);
		this.particles.step(dt);

		const snap = this.vehicle.snapshot(this.fluid.mass());
		if (this.phase === "driving") {
			this.elapsed += dt;
			this.stats.tick(
				dt,
				snap.onRoad,
				snap.gForce,
				this.fluid.sloshSpeed(),
				spillDelta,
				snap.airborne,
			);
			this.replay.record(dt, drive);
			this.ghost.step();
			this.updateCheckpoints(snap);
			this.checkContractFail();
			this.showTutorialHint(
				spillDelta > 0.2,
				drive.handbrake === true,
				snap.gForce > 1.1,
				Math.abs(this.track.gradeAt(this.track.query(snap.pos).along)) >= 0.02,
				snap.airborne,
				this.elapsed,
			);
		}

		this.trackWheels(dt);
		this.trackSpillPopups(dt);
		if (spillDelta > 0.3) this.audio.spillSplash(spillDelta);
		const slosh = this.fluid.sloshSpeed();
		this.audio.sloshTick(slosh, sloshCutoffFor(this.runConfig.cargo));
		this.audio.lipAccent(lipAccentGain(sloshLevel(slosh), spillDelta > 0.3));
		this.checkFinish();
	}

	private updateCheckpoints(snap: VehicleSnapshot) {
		const along = this.track.query(snap.pos).along;
		while (
			this.stats.checkpointIndex < this.track.checkpoints.length &&
			along >= this.track.checkpoints[this.stats.checkpointIndex]
		) {
			this.stats.checkpointIndex++;
			const n = this.stats.checkpointIndex;
			const pos = snap.pos;
			this.particles.addPopup(pos.x, pos.y - 1.8, `CHECKPOINT ${n}`, false);
			this.audio.checkpointChirp();
		}
	}

	private checkContractFail() {
		if (this.runConfig.mode !== "contract") return;
		if (this.fluid.remainingRatio() < CONTRACT_ABORT_RATIO)
			this.failRun("Cargo lost — contract void.");
	}

	private failRun(reason: string) {
		if (this.phase !== "driving") return;
		this.phase = "failed";
		this.paused = false;
		this.hud.pausePanel.hidden = true;
		this.hud.fail.querySelector("p")!.textContent = reason;
		this.hud.fail.hidden = false;
		this.syncAudioDuck();
		this.syncPauseUi();
	}

	private showTutorialHint(
		spilled: boolean,
		handbrake: boolean,
		highG: boolean,
		onGrade: boolean,
		airborne: boolean,
		elapsed: number,
	) {
		const hint = nextTutorialHint({
			spilled,
			handbrake,
			highG,
			onGrade,
			airborne,
			elapsed,
		});
		if (!hint) return;
		this.hud.tutorial.textContent = tutorialMessage(hint);
		this.hud.tutorial.hidden = false;
		window.setTimeout(() => {
			this.hud.tutorial.hidden = true;
		}, 4500);
	}

	private toWorldSpill(local: Vec2, relVel: Vec2, volume: number): SpillEvent {
		const pos = this.vehicle.localToWorld(local);
		const base = this.vehicle.pointVelocity(local);
		const angle = this.vehicle.angle;
		const c = Math.cos(angle);
		const s = Math.sin(angle);
		const z = this.vehicle.snapshot().z;
		return {
			x: pos.x,
			y: pos.y,
			z: z + TRUNK_LIP_HEIGHT,
			vx: base.x + relVel.x * c - relVel.y * s,
			vy: base.y + relVel.x * s + relVel.y * c,
			vz: 0.4,
			volume,
			groundZ: this.track.heightAt(this.track.query(pos).along),
		};
	}

	private emitSpills(events: SpillEvent[]) {
		this.particles.emit(events);
		for (const e of events) this.spillWindow += e.volume;
		if (
			events.length &&
			this.settings.cameraPunch &&
			!this.settings.reducedMotion
		)
			this.punch = Math.min(1, this.punch + 0.35);
	}

	private trackSpillPopups(dt: number) {
		this.spillTimer -= dt;
		if (this.spillTimer > 0 || this.spillWindow < 0.0005) return;
		const liters = this.spillWindow * 1000;
		const pos = this.vehicle.localToWorld({ x: -1.35, y: 0 });
		const big = liters > 6;
		this.particles.addPopup(
			pos.x,
			pos.y - 1.5,
			big ? `SPLOOSH! -${liters.toFixed(0)}L` : `-${liters.toFixed(1)}L`,
			big,
		);
		this.pushLive({ spillLiters: liters });
		this.spillWindow = 0;
		this.spillTimer = 0.45;
	}

	private pushLive(partial: {
		spillLiters?: number;
		band?: SloshBand;
		prevBand?: SloshBand;
		threat?: CargoThreat;
		prevThreat?: CargoThreat;
	}) {
		const msg = liveAnnouncement(partial);
		if (!msg) return;
		this.hud.live.textContent = msg;
	}

	private trackWheels(dt: number) {
		const snap = this.vehicle.snapshot();
		snap.wheels.forEach((w, i) => {
			const prev = this.lastWheel[i];
			if (w.skid > 0.12 && snap.speed > 1) {
				if (prev)
					this.particles.addSkid(
						prev,
						w.world,
						w.skid * (w.sand ? 0.6 : 1),
						this.track.heightAt(this.track.query(w.world).along),
					);
				this.lastWheel[i] = { ...w.world };
			} else {
				this.lastWheel[i] = null;
			}
			const dusty = (w.sand && snap.speed > 3) || w.skid > 0.35;
			if (
				i >= 2 &&
				dusty &&
				Math.random() <
					dt * (w.sand ? 26 : 14) * Math.min(1, snap.speed / 10 + w.skid)
			) {
				this.particles.addPuff(
					w.world.x,
					w.world.y,
					-snap.vel.x * 0.15 + (Math.random() - 0.5) * 1.5,
					-snap.vel.y * 0.15 + (Math.random() - 0.5) * 1.5,
					0.35 + Math.random() * 0.35,
					snap.z,
				);
			}
		});
		if (snap.impact > 25) {
			if (!this.settings.reducedMotion)
				this.shake = Math.min(1, this.shake + snap.impact / 120);
			const bursts = snap.impactKind === "barrel" ? 5 : 3;
			for (let i = 0; i < bursts; i++) {
				this.particles.addPuff(
					snap.pos.x + (Math.random() - 0.5) * 1.4,
					snap.pos.y + (Math.random() - 0.5) * 1.4,
					snap.vel.x * -0.1 + (Math.random() - 0.5) * 2.4,
					snap.vel.y * -0.1 + (Math.random() - 0.5) * 2.4,
					0.4 + Math.random() * 0.45,
					snap.z + 0.2,
				);
			}
		}
		this.audio.impactThud(snap.impact, snap.impactKind);
		const skid = snap.wheels.reduce((m, w) => Math.max(m, w.skid), 0);
		this.audio.tireScrub(skid);
		const sandy = snap.wheels.filter((w) => w.sand).length >= 2;
		const throttle = Math.abs(this.input.poll(0).throttle);
		const mix = airborneMix(
			snap.speed,
			throttle,
			rollGainFor(snap.speed, sandy),
			snap.airborne,
		);
		this.audio.surfaceRoll(snap.airborne ? 0 : snap.speed, sandy);
		this.audio.surfaceWind(snap.speed, snap.airborne);
		this.audio.engineLoad(snap.speed, mix.throttle);
		const threat = cargoThreatLevel(
			this.fluid.remainingRatio(),
			this.runConfig.mode,
		);
		let clearance = Number.POSITIVE_INFINITY;
		for (const o of this.track.obstacles) {
			const gap = Math.hypot(o.x - snap.pos.x, o.y - snap.pos.y) - o.r - 1.1;
			if (gap < clearance) clearance = gap;
		}
		this.audio.musicTick(
			musicMixFor({
				speed: snap.speed,
				slosh: this.fluid.sloshSpeed(),
				threat,
				nearMiss: nearMissFor(clearance),
				airborne: snap.airborne,
				impact: snap.impact,
				active:
					this.settings.music &&
					!this.paused &&
					this.phase !== "finished" &&
					this.phase !== "failed",
			}),
		);
		this.pitchSettle = settlePitch(
			this.pitchSettle.pitch,
			this.pitchSettle.velocity,
			snap.pitch,
			dt,
			this.settings.reducedMotion,
		);
	}

	private updateCamera(frameDt: number, snap: VehicleSnapshot) {
		const reduced = this.settings.reducedMotion;
		const target = chasePoint(snap.pos, snap.vel);
		const followed = followChase(this.camera, target, frameDt);
		this.camera.x = followed.x;
		this.camera.y = followed.y;
		const zoom = punchZoom(
			this.targetZoom(snap.speed),
			this.punch,
			reduced,
			this.settings.cameraPunch,
		);
		this.punch = decayPunch(
			this.punch,
			frameDt,
			reduced,
			this.settings.cameraPunch,
		);
		this.camera.zoom += (zoom - this.camera.zoom) * (1 - 0.2 ** frameDt);
		this.shake = decayShake(this.shake, frameDt, reduced);
	}

	private checkFinish() {
		if (this.phase !== "driving") return;
		const pos = this.vehicle.localToWorld({ x: 0, y: 0 });
		const q = this.track.query(pos);
		if (q.along >= this.track.finishS && q.dist < this.track.roadWidth) {
			const snap = this.vehicle.snapshot();
			const kept = this.fluid.remainingRatio();
			const floor = finishCargoFloor(this.runConfig.mode);
			if (floor > 0 && kept < floor) {
				this.failRun(
					this.runConfig.mode === "timetrial"
						? "Too much spill for a timed run — need 85% cargo."
						: "Not enough cargo left to fulfill the contract.",
				);
				return;
			}
			this.phase = "finished";
			this.paused = false;
			this.hud.pausePanel.hidden = true;
			const g = grade(kept);
			this.hud.resultKept.textContent = `${(kept * 100).toFixed(0)}%`;
			this.hud.resultTime.textContent = fmtTime(this.elapsed);
			this.hud.resultGrade.textContent = g.letter;
			this.hud.resultQuip.textContent = g.quip;
			this.hud.resultStats.textContent = `Spilled ${this.stats.spilledLiters.toFixed(1)} L · peak slosh ${this.stats.peakSlosh.toFixed(2)} m/s · off-road ${this.stats.offRoadTime.toFixed(1)} s · air ${this.stats.airborneTime.toFixed(1)} s · max ${this.stats.peakG.toFixed(2)} g`;
			this.hud.resultSeed.textContent = this.runConfig.daily
				? `Daily ${this.runConfig.seed}`
				: `Seed ${this.runConfig.seed}`;
			const best = maybeSaveBest(
				this.runConfig.mode,
				this.runConfig.seed,
				this.runConfig.daily,
				g.letter,
				kept,
				this.elapsed,
				this.runConfig.difficulty,
			);
			if (best && !this.runConfig.customGoo) {
				saveGhostRecording(
					this.runConfig.mode,
					this.runConfig.seed,
					this.runConfig.daily,
					this.replay.export(this.runConfig),
					this.runConfig.difficulty,
				);
			}
			const unlocked = unlockAchievements({
				grade: g.letter,
				spilled: this.fluid.spilledVolume,
				difficulty: this.runConfig.difficulty,
				archetype: resolveArchetype(
					this.runConfig.seed,
					this.runConfig.archetype,
				),
				mode: this.runConfig.mode,
				daily: this.runConfig.daily,
			});
			this.hud.resultAchievements.textContent = unlocked.length
				? `Unlocked: ${unlocked.map(achievementLabel).join(", ")}`
				: "";
			this.lastShare = {
				grade: g.letter,
				kept,
				timeLabel: fmtTime(this.elapsed),
				detail: this.hud.resultStats.textContent ?? "",
			};
			this.hud.resultBest.textContent = best
				? `New best for this ${this.runConfig.daily ? "daily" : "seed"}!`
				: "";
			this.hud.result.hidden = false;
			this.hud.resultGrade.classList.add("grade-stamp");
			this.particles.addPopup(snap.pos.x, snap.pos.y - 3, "DELIVERED!", true);
			this.syncAudioDuck();
			this.audio.finishSting();
		}
	}

	private setText(el: HTMLElement, text: string) {
		if (this.hudCache.get(el) === text) return;
		this.hudCache.set(el, text);
		el.textContent = text;
	}

	private updateHud(snap: VehicleSnapshot) {
		const kept = this.fluid.remainingRatio();
		this.setText(this.hud.liquid, `${(kept * 100).toFixed(0)}%`);
		const prevThreat = this.cargoThreat;
		this.cargoThreat = cargoThreatLevel(kept, this.runConfig.mode);
		const bar = `${(kept * 100).toFixed(1)}%`;
		const barKey = `${bar}:${this.cargoThreat}`;
		if (this.hudCache.get(this.hud.liquidBar) !== barKey) {
			this.hudCache.set(this.hud.liquidBar, barKey);
			this.hud.liquidBar.style.width = bar;
			this.hud.liquidBar.dataset.level =
				this.cargoThreat === "danger" ? "bad" : this.cargoThreat;
		}
		if (this.cargoThreat === "danger" && prevThreat !== "danger")
			this.pushLive({ threat: "danger", prevThreat });
		this.setText(this.hud.speed, (snap.speed * 3.6).toFixed(0));
		this.setText(this.hud.time, fmtTime(this.elapsed));
		const split = ghostSplitLabel(
			this.elapsed,
			this.ghost.elapsed,
			this.ghost.active && this.phase === "driving",
		);
		if (split) {
			this.hud.ghostSplit.hidden = false;
			this.setText(this.hud.ghostSplit, split);
		} else {
			this.hud.ghostSplit.hidden = true;
		}
		this.setText(
			this.hud.progress,
			`${(this.track.progress(snap.pos) * 100).toFixed(0)}%`,
		);
		this.setText(
			this.hud.checkpoint,
			`${Math.min(this.stats.checkpointIndex, this.track.checkpoints.length)}/${this.track.checkpoints.length}`,
		);
		this.setText(this.hud.g, snap.gForce.toFixed(2));
		this.setText(
			this.hud.grade,
			gradeLabel(this.track.gradeAt(this.track.query(snap.pos).along)),
		);
		this.setText(this.hud.air, airborneLabel(snap.airborne));
		const slosh = this.fluid.sloshSpeed();
		const prevBand = this.hudSloshBand;
		this.hudSloshBand = nextSloshBand(this.hudSloshBand, slosh);
		const band = this.hudSloshBand;
		if (band === "lip" && prevBand !== "lip") this.pushLive({ band, prevBand });
		this.setText(this.hud.slosh, band);
		const fill = `${(sloshFill(slosh) * 100).toFixed(0)}%`;
		if (this.hudCache.get(this.hud.sloshBar) !== `${band}:${fill}`) {
			this.hudCache.set(this.hud.sloshBar, `${band}:${fill}`);
			this.hud.sloshBar.style.width = fill;
			this.hud.sloshBar.dataset.level = band;
		}
	}

	private frame(now: number) {
		const frameDt = Math.min(0.1, (now - this.last) / 1000);
		this.last = now;
		this.clock += frameDt;

		this.accum += frameDt;
		let steps = 0;
		while (this.accum >= FIXED_DT && steps < MAX_STEPS) {
			this.simulate(FIXED_DT);
			this.accum -= FIXED_DT;
			steps++;
		}
		if (steps === MAX_STEPS) this.accum = 0;

		const snap = this.vehicle.snapshot(this.fluid.mass());
		this.vehicle.syncProps(this.track);
		const drawSnap: VehicleSnapshot = {
			...snap,
			pitch: this.pitchSettle.pitch,
		};
		this.updateCamera(frameDt, drawSnap);

		const shakeAmp = this.shake * 0.35;
		const cam: Camera = {
			x: this.camera.x + (Math.random() - 0.5) * shakeAmp,
			y: this.camera.y + (Math.random() - 0.5) * shakeAmp,
			zoom: this.camera.zoom,
		};
		const ghostSnap = this.ghost.snapshot();
		this.renderer.draw({
			track: this.track,
			car: drawSnap,
			fluid: this.fluid,
			ghost: ghostSnap
				? { car: ghostSnap, fluid: this.ghost.fluid }
				: undefined,
			particles: this.particles,
			camera: cam,
			time: this.clock,
			debug: this.debug,
			chevron: bendTarget(this.track, snap.pos),
		});

		const pr = this.renderer.canvas.width / Math.max(1, this.wrap.clientWidth);
		const hatch = 5 * pr;
		const period = hatch * HATCH_PERIOD;
		const wrapMod = (v: number) => ((v % period) + period) % period;
		const hatchOffset = this.renderer.hatchOffset(cam);
		this.presenter.present(this.renderer.canvas, {
			worldOffset: [wrapMod(hatchOffset.x), wrapMod(hatchOffset.y)],
			inkWidth: Math.max(1, pr),
			hatchSpacing: hatch,
			time: this.clock,
			enabled: this.inkEnabled,
			hatchLevel: hatchLevelForQuality(this.settings.quality),
			grain: captureGrain(this.review, this.demo && this.paused),
		});

		this.updateHud(snap);
		this.trunkIso.draw(this.fluid);
		if (this.popoutOpen) this.trunkIsoPopout.draw(this.fluid, true, true);
		requestAnimationFrame((t) => this.frame(t));
	}
}
