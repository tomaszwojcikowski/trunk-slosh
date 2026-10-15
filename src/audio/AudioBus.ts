/** Web Audio mix. Real free samples when loaded; procedural fallback otherwise. */

import {
	type GameAudioBuffers,
	hasMusicStems,
	loadGameAudio,
	SAMPLE_MUSIC_BPM,
	type SfxBufferKey,
} from "./assets";
import {
	bassNoteHz,
	leadNoteHz,
	MUSIC_ROOT,
	type MusicMix,
	musicGroupGainFor,
} from "./dynamicMusic";
import { impactVoiceFor, windGainFor } from "./windVoice";

/** Loud enough to read as an engine on laptop speakers, silent when parked. */
/** Silent under the collision threshold; otherwise a short thud, capped. */
export function impactGainFor(impact: number): number {
	if (impact < 25) return 0;
	return Math.min(0.3, (impact - 25) * 0.004);
}

export function engineGainFor(speed: number, throttle: number): number {
	const drive = Math.min(1, Math.abs(throttle));
	if (speed <= 0.35 && drive <= 0.02) return 0;
	return Math.min(0.28, 0.07 + drive * 0.16 + Math.min(speed, 40) * 0.0035);
}

/** Fundamental frequency (Hz). Throttle revs it; speed carries it up the range. */
export function engineFreqFor(speed: number, throttle: number): number {
	const drive = Math.min(1, Math.abs(throttle));
	return 46 + Math.min(speed, 42) * 2.4 + drive * 34;
}

/** Map engine Hz onto sample playbackRate around a mid-cruise reference. */
export function engineRateFor(speed: number, throttle: number): number {
	const freq = engineFreqFor(speed, throttle);
	return Math.max(0.55, Math.min(1.85, freq / 95));
}

/** Continuous liquid layer. Quiet until the surface is actually moving. */
export function sloshGainFor(energy: number): number {
	if (energy < 0.08) return 0;
	return Math.min(0.16, 0.035 + energy * 0.07);
}

export function splashGainFor(liters: number): number {
	return Math.min(0.36, 0.1 + liters * 0.012);
}

/** Road rumble. Sand is louder and is filtered lower by the bus. */
export function rollGainFor(speed: number, sand: boolean): number {
	if (speed < 1.2) return 0;
	const base = Math.min(0.08, (speed - 1.2) * 0.0032);
	return sand ? base * 1.65 : base;
}

/** Master gain from the settings slider. Today's bus peak lived at 0.8. */
export function masterGainFor(volume: number): number {
	return Math.max(0, Math.min(1, volume)) * 0.8;
}

/**
 * Soft mute ramp. Never cancel+snap to zero — that clicks when SFX toggles.
 * Returns the target the param should ease toward.
 * Live when SFX or music is on so one mute does not kill the other bus.
 */
export function softMuteTarget(
	sfx: boolean,
	volume: number,
	music = false,
): number {
	if (!sfx && !music) return 0;
	return masterGainFor(volume);
}

type GainParam = {
	cancelScheduledValues(t: number): void;
	setValueAtTime(v: number, t: number): void;
	setTargetAtTime(v: number, t: number, c: number): void;
	value: number;
};

/** Ease a gain without a one-frame full-level spike. */
export function softGainRamp(
	param: GainParam,
	target: number,
	t: number,
	timeConstant = 0.06,
) {
	param.setTargetAtTime(Math.max(0, target), t, timeConstant);
}

type Loop = { filter: BiquadFilterNode; gain: GainNode };

type ScoreVoice = {
	osc: OscillatorNode;
	gain: GainNode;
	filter: BiquadFilterNode;
};

type SampleVoice = {
	source: AudioBufferSourceNode;
	gain: GainNode;
	filter?: BiquadFilterNode;
};

export class AudioBus {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private duck: GainNode | null = null;
	private sfxBus: GainNode | null = null;
	private musicBus: GainNode | null = null;
	private engine: OscillatorNode | null = null;
	private engineBody: OscillatorNode | null = null;
	private engineHarmonic: OscillatorNode | null = null;
	private engineSub: OscillatorNode | null = null;
	private engineFilter: BiquadFilterNode | null = null;
	private engineGain: GainNode | null = null;
	private bodyGain: GainNode | null = null;
	private harmonicGain: GainNode | null = null;
	private subGain: GainNode | null = null;
	private scrub: Loop | null = null;
	private exhaust: Loop | null = null;
	private roll: Loop | null = null;
	private slosh: Loop | null = null;
	private wind: Loop | null = null;
	private padGain: GainNode | null = null;
	private padFilter: BiquadFilterNode | null = null;
	private bass: ScoreVoice | null = null;
	private pulse: ScoreVoice | null = null;
	private lead: ScoreVoice | null = null;
	private tension: ScoreVoice | null = null;
	private air: ScoreVoice | null = null;
	private hat: Loop | null = null;
	private musicHit: GainNode | null = null;
	private musicKick: OscillatorNode | null = null;
	private noise: AudioBuffer | null = null;
	private armed = false;
	private _enabled = true;
	private _music = true;
	private _volume = 1;
	private _ducked = false;
	private lastSplash = -1;
	private lastImpact = -1;
	private lastSlosh = -1;
	private lastMusicHit = -1;
	private musicBeat = 0;
	private nextMusicBeat = -1;
	private welcomed = false;
	private buffers: GameAudioBuffers | null = null;
	private loadStarted = false;
	private sampleEngine: SampleVoice | null = null;
	private sampleExhaust: SampleVoice | null = null;
	private sampleScrub: SampleVoice | null = null;
	private sampleRoll: SampleVoice | null = null;
	private sampleRollSand: SampleVoice | null = null;
	private sampleSlosh: SampleVoice | null = null;
	private sampleWind: SampleVoice | null = null;
	private sampleMusic: Partial<
		Record<"bed" | "bass" | "drive" | "lead", SampleVoice>
	> = {};
	private usingSampleMusic = false;
	private usingSampleEngine = false;

	get enabled() {
		return this._enabled;
	}

	set enabled(value: boolean) {
		this._enabled = value;
		this.applyMaster();
		if (!value) this.silenceSfx();
		if (!value && !this._music) this.silence();
	}

	get music() {
		return this._music;
	}

	set music(value: boolean) {
		this._music = value;
		this.applyMaster();
		if (!value) this.silenceMusic();
		if (!value && !this._enabled) this.silence();
	}

	get volume() {
		return this._volume;
	}

	set volume(value: number) {
		this._volume = Math.max(0, Math.min(1, value));
		this.applyMaster();
	}

	/** Call from a pointer or key event so the browser allows playback. */
	unlock() {
		this.armed = true;
		this.create();
		this.applyMaster();
		if (!this._enabled && !this._music) {
			this.silence();
			return;
		}
		const ctx = this.ctx;
		if (!ctx) return;
		if (ctx.state === "suspended") void ctx.resume();
		this.beginSampleLoad();
		if (!this.welcomed && this.master && this._enabled) {
			this.welcomed = true;
			if (!this.playSfx("welcome", 0.18, 1))
				this.tone(ctx, 98, 0.14, 0.12, ctx.currentTime, "sawtooth");
		}
	}

	/** Duck continuous layers on pause/results. One-shots still route to master. */
	setDucked(ducked: boolean) {
		this._ducked = ducked;
		const ctx = this.ctx;
		if (!ctx || !this.duck) return;
		softGainRamp(this.duck.gain, ducked ? 0 : 1, ctx.currentTime, 0.08);
	}

	idle() {
		this.engineLoad(0, 0);
		this.tireScrub(0);
		this.surfaceRoll(0, false);
		this.surfaceWind(0, false);
		this.sloshTick(0);
		this.musicTick({
			bed: 0,
			drive: 0,
			bass: 0,
			lead: 0,
			tension: 0,
			air: 0,
			hit: 0,
			intensity: 0,
			bpm: 0,
		});
	}

	/**
	 * Adaptive chase score. Sample stems when loaded; otherwise the procedural
	 * pad / bass / lead / pulse / hats groove.
	 */
	musicTick(mix: MusicMix) {
		const ctx = this.ensureMusic();
		if (!ctx || !this.musicBus) return;
		const t = ctx.currentTime;
		const group = musicGroupGainFor(this._volume);
		softGainRamp(this.musicBus.gain, group, t, 0.1);

		if (this.usingSampleMusic) {
			this.musicTickSamples(mix, t);
			return;
		}

		if (
			!this.padGain ||
			!this.bass ||
			!this.pulse ||
			!this.lead ||
			!this.tension ||
			!this.air ||
			!this.hat ||
			!this.musicHit
		)
			return;

		if (mix.bpm <= 0) {
			this.silenceMusicVoices(t);
			this.nextMusicBeat = -1;
			return;
		}

		softGainRamp(this.padGain.gain, mix.bed * 0.42, t, 0.14);
		this.padFilter?.frequency.setTargetAtTime(
			420 + mix.intensity * 900 + mix.air * 500,
			t,
			0.12,
		);
		softGainRamp(this.bass.gain.gain, mix.bass * 0.7, t, 0.1);
		this.bass.filter.frequency.setTargetAtTime(
			140 + mix.drive * 220 + mix.intensity * 180,
			t,
			0.1,
		);
		softGainRamp(this.pulse.gain.gain, mix.drive * 0.08, t, 0.12);
		this.pulse.filter.frequency.setTargetAtTime(380 + mix.drive * 700, t, 0.1);
		softGainRamp(this.lead.gain.gain, mix.lead * 0.28, t, 0.1);
		this.lead.filter.frequency.setTargetAtTime(
			900 + mix.lead * 1400 + mix.air * 600,
			t,
			0.1,
		);
		softGainRamp(this.tension.gain.gain, mix.tension * 0.38, t, 0.08);
		this.tension.osc.frequency.setTargetAtTime(
			MUSIC_ROOT * 2 * (1 + mix.tension * 0.08),
			t,
			0.08,
		);
		this.tension.filter.frequency.setTargetAtTime(
			500 + mix.tension * 1600,
			t,
			0.08,
		);
		softGainRamp(this.air.gain.gain, mix.air * 0.4, t, 0.12);
		this.air.filter.frequency.setTargetAtTime(1200 + mix.air * 1800, t, 0.12);
		softGainRamp(
			this.hat.gain.gain,
			mix.drive * 0.04 + mix.intensity * 0.03,
			t,
			0.1,
		);

		if (mix.hit > 0.05 && t - this.lastMusicHit > 0.16) {
			this.lastMusicHit = t;
			if (!this.playSfx("musicHit", mix.hit * 0.35, 0.9 + mix.hit * 0.2)) {
				const g = this.musicHit.gain;
				g.setValueAtTime(Math.max(0.0001, g.value), t);
				g.setTargetAtTime(mix.hit * 0.7, t, 0.015);
				g.setTargetAtTime(0.0001, t + 0.06, 0.1);
				this.musicKick?.frequency.setValueAtTime(90 + mix.hit * 40, t);
				this.musicKick?.frequency.setTargetAtTime(42, t + 0.02, 0.05);
			}
		}

		this.advanceMusicClock(mix, t);
	}

	private musicTickSamples(mix: MusicMix, t: number) {
		if (mix.bpm <= 0) {
			for (const voice of Object.values(this.sampleMusic)) {
				if (voice) softGainRamp(voice.gain.gain, 0, t, 0.08);
			}
			return;
		}

		const rate = Math.max(0.85, Math.min(1.12, mix.bpm / SAMPLE_MUSIC_BPM));
		const bed = this.sampleMusic.bed;
		const bass = this.sampleMusic.bass;
		const drive = this.sampleMusic.drive;
		const lead = this.sampleMusic.lead;

		if (bed) {
			bed.source.playbackRate.setTargetAtTime(rate, t, 0.08);
			softGainRamp(bed.gain.gain, mix.bed * 0.55, t, 0.12);
			bed.filter?.frequency.setTargetAtTime(
				1800 + mix.air * 2200 + mix.intensity * 800,
				t,
				0.12,
			);
		}
		if (bass) {
			bass.source.playbackRate.setTargetAtTime(rate, t, 0.08);
			softGainRamp(bass.gain.gain, mix.bass * 0.7, t, 0.1);
		}
		if (drive) {
			drive.source.playbackRate.setTargetAtTime(rate, t, 0.08);
			softGainRamp(
				drive.gain.gain,
				mix.drive * 0.55 + mix.intensity * 0.12,
				t,
				0.1,
			);
		}
		if (lead) {
			lead.source.playbackRate.setTargetAtTime(rate, t, 0.08);
			const leadGain = mix.lead * 0.48 + mix.tension * 0.22;
			softGainRamp(lead.gain.gain, leadGain, t, 0.1);
			lead.filter?.frequency.setTargetAtTime(
				1200 + mix.lead * 1600 + mix.tension * 900,
				t,
				0.1,
			);
		}

		if (mix.hit > 0.05 && t - this.lastMusicHit > 0.16) {
			this.lastMusicHit = t;
			this.playSfx("musicHit", mix.hit * 0.4, 0.95 + mix.hit * 0.15);
		}
	}

	private advanceMusicClock(mix: MusicMix, t: number) {
		if (!this.bass || !this.pulse || !this.lead || !this.hat) return;
		const beatSec = 60 / Math.max(60, mix.bpm);
		if (this.nextMusicBeat < 0 || this.nextMusicBeat < t - 0.25)
			this.nextMusicBeat = t + 0.02;
		let guard = 0;
		while (this.nextMusicBeat <= t + 0.08 && guard++ < 8) {
			const when = Math.max(t, this.nextMusicBeat);
			const step = this.musicBeat;
			const downbeat = step % 4 === 0;
			const eighth = step % 2 === 0;
			const tense = mix.tension > 0.45;

			this.bass.osc.frequency.setTargetAtTime(bassNoteHz(step), when, 0.01);
			this.lead.osc.frequency.setTargetAtTime(
				leadNoteHz(step, tense),
				when,
				0.012,
			);

			const pulsePeak = mix.drive * (downbeat ? 0.55 : 0.28);
			const pg = this.pulse.gain.gain;
			pg.setValueAtTime(Math.max(0.0001, pg.value), when);
			pg.setTargetAtTime(pulsePeak, when, 0.012);
			pg.setTargetAtTime(mix.drive * 0.06, when + beatSec * 0.22, 0.05);

			if (mix.bass > 0.2 && downbeat) {
				const bg = this.bass.gain.gain;
				bg.setValueAtTime(Math.max(0.0001, bg.value), when);
				bg.setTargetAtTime(mix.bass * 0.95, when, 0.01);
				bg.setTargetAtTime(mix.bass * 0.55, when + beatSec * 0.35, 0.06);
			}

			if (mix.lead > 0.15 && (eighth || tense)) {
				const lg = this.lead.gain.gain;
				lg.setValueAtTime(Math.max(0.0001, lg.value), when);
				lg.setTargetAtTime(mix.lead * 0.48, when, 0.01);
				lg.setTargetAtTime(mix.lead * 0.16, when + beatSec * 0.28, 0.05);
			}

			if (mix.drive > 0.25 && !downbeat) {
				const hg = this.hat.gain.gain;
				const hatPeak = (0.08 + mix.intensity * 0.14) * mix.drive;
				hg.setValueAtTime(Math.max(0.0001, hg.value), when);
				hg.setTargetAtTime(hatPeak, when, 0.005);
				hg.setTargetAtTime(mix.drive * 0.03, when + 0.04, 0.03);
				this.hat.filter.frequency.setTargetAtTime(
					4200 + mix.intensity * 2800,
					when,
					0.02,
				);
			}

			this.musicBeat = step + 1;
			this.nextMusicBeat += beatSec;
		}
	}

	private silenceMusicVoices(t: number) {
		const nodes = [
			this.padGain,
			this.bass?.gain,
			this.pulse?.gain,
			this.lead?.gain,
			this.tension?.gain,
			this.air?.gain,
			this.hat?.gain,
			this.musicHit,
		];
		for (const node of nodes) {
			if (!node) continue;
			softGainRamp(node.gain, 0, t, 0.08);
		}
		for (const voice of Object.values(this.sampleMusic)) {
			if (voice) softGainRamp(voice.gain.gain, 0, t, 0.08);
		}
	}

	engineLoad(speed: number, throttle: number) {
		const ctx = this.ensure();
		if (!ctx || !this.engineGain) return;
		const t = ctx.currentTime;
		const drive = Math.min(1, Math.abs(throttle));
		const gain = engineGainFor(speed, throttle);

		if (this.usingSampleEngine && this.sampleEngine) {
			const rate = engineRateFor(speed, throttle);
			this.sampleEngine.source.playbackRate.setTargetAtTime(rate, t, 0.06);
			softGainRamp(this.sampleEngine.gain.gain, gain * 1.15, t, 0.05);
			if (this.sampleExhaust) {
				this.sampleExhaust.source.playbackRate.setTargetAtTime(
					rate * 0.97,
					t,
					0.06,
				);
				softGainRamp(
					this.sampleExhaust.gain.gain,
					Math.min(0.14, gain * (0.35 + drive * 0.55)),
					t,
					0.05,
				);
			}
			softGainRamp(this.engineGain.gain, 0, t, 0.05);
			return;
		}

		if (
			!this.engine ||
			!this.engineBody ||
			!this.engineHarmonic ||
			!this.engineSub
		)
			return;
		const freq = engineFreqFor(speed, throttle);
		this.engine.frequency.setTargetAtTime(freq, t, 0.05);
		this.engineBody.frequency.setTargetAtTime(freq * 0.993, t, 0.07);
		this.engineHarmonic.frequency.setTargetAtTime(freq * 2.01, t, 0.05);
		this.engineSub.frequency.setTargetAtTime(freq * 0.5, t, 0.08);
		this.engineFilter?.frequency.setTargetAtTime(
			380 + Math.min(speed, 40) * 18 + drive * 320,
			t,
			0.08,
		);
		softGainRamp(this.engineGain.gain, gain, t, 0.05);
		if (this.bodyGain)
			softGainRamp(this.bodyGain.gain, gain > 0 ? 0.45 : 0, t, 0.05);
		if (this.harmonicGain)
			softGainRamp(this.harmonicGain.gain, gain * 0.22, t, 0.05);
		if (this.subGain) softGainRamp(this.subGain.gain, gain * 0.55, t, 0.06);
		this.exhaust?.filter.frequency.setTargetAtTime(160 + drive * 220, t, 0.05);
		if (this.exhaust)
			softGainRamp(
				this.exhaust.gain.gain,
				Math.min(0.1, gain * (0.25 + drive * 0.45)),
				t,
				0.05,
			);
	}

	tireScrub(amount: number) {
		const ctx = this.ensure();
		if (!ctx) return;
		const t = ctx.currentTime;
		const scrub = amount < 0.2 ? 0 : Math.min(1, amount);
		if (this.sampleScrub) {
			this.sampleScrub.source.playbackRate.setTargetAtTime(
				0.85 + scrub * 0.35,
				t,
				0.04,
			);
			softGainRamp(this.sampleScrub.gain.gain, scrub * 0.28, t, 0.03);
			if (this.scrub) softGainRamp(this.scrub.gain.gain, 0, t, 0.03);
			return;
		}
		if (!this.scrub) return;
		this.scrub.filter.frequency.setTargetAtTime(700 + scrub * 900, t, 0.03);
		softGainRamp(this.scrub.gain.gain, scrub * 0.22, t, 0.03);
	}

	/** Continuous contact rumble. Call with the current speed every step so it decays. */
	surfaceRoll(speed: number, sand: boolean) {
		const ctx = this.ensure();
		if (!ctx) return;
		const t = ctx.currentTime;
		const gain = rollGainFor(speed, sand);

		if (this.sampleRoll || this.sampleRollSand) {
			const asphalt = this.sampleRoll;
			const grit = this.sampleRollSand;
			if (asphalt) {
				asphalt.source.playbackRate.setTargetAtTime(
					0.7 + Math.min(speed, 40) * 0.012,
					t,
					0.08,
				);
				softGainRamp(
					asphalt.gain.gain,
					sand ? gain * 0.35 : gain * 1.4,
					t,
					0.08,
				);
			}
			if (grit) {
				grit.source.playbackRate.setTargetAtTime(
					0.85 + Math.min(speed, 40) * 0.01,
					t,
					0.08,
				);
				softGainRamp(grit.gain.gain, sand ? gain * 1.5 : 0, t, 0.08);
			}
			if (this.roll) softGainRamp(this.roll.gain.gain, 0, t, 0.08);
			return;
		}

		if (!this.roll) return;
		this.roll.filter.frequency.setTargetAtTime(sand ? 420 : 980, t, 0.08);
		softGainRamp(this.roll.gain.gain, gain, t, 0.08);
	}

	/** Desert wind bed. Separate from roll; thinner in the air. */
	surfaceWind(speed: number, airborne: boolean) {
		const ctx = this.ensure();
		if (!ctx) return;
		const t = ctx.currentTime;
		const gain = windGainFor(speed, airborne);
		if (this.sampleWind) {
			this.sampleWind.source.playbackRate.setTargetAtTime(
				airborne ? 1.15 : 0.9 + Math.min(speed, 40) * 0.008,
				t,
				0.1,
			);
			softGainRamp(this.sampleWind.gain.gain, gain * 2.4, t, 0.1);
			if (this.wind) softGainRamp(this.wind.gain.gain, 0, t, 0.1);
			return;
		}
		if (!this.wind) return;
		this.wind.filter.frequency.setTargetAtTime(
			airborne ? 1400 : 900 + Math.min(speed, 40) * 12,
			t,
			0.1,
		);
		softGainRamp(this.wind.gain.gain, gain, t, 0.1);
	}

	impactThud(impact: number, kind?: string | null) {
		const gain = impactGainFor(impact);
		if (gain <= 0) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastImpact < 0.12) return;
		this.lastImpact = t;
		const voice = impactVoiceFor(kind);
		if (this.playSfx(voice.sample, gain * 1.1, 0.9 + Math.min(0.25, gain)))
			return;
		this.tone(ctx, voice.freq, 0.1, gain, t, "sine");
		if (voice.filter)
			this.burst(
				ctx,
				voice.filter,
				0.08,
				Math.min(0.1, gain * 0.35),
				"bandpass",
			);
	}

	spillSplash(liters: number) {
		if (liters < 0.3) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastSplash < 0.09) return;
		this.lastSplash = t;
		const gain = splashGainFor(liters);
		const key: SfxBufferKey = liters > 4 ? "splashHeavy" : "splash";
		if (this.playSfx(key, gain, 0.85 + Math.min(0.3, liters * 0.02))) return;
		this.tone(ctx, 90 + Math.min(40, liters), 0.16, gain * 0.7, t, "sine");
		this.burst(ctx, 280 + Math.min(640, liters * 18), 0.2, gain, "bandpass");
		if (liters > 4)
			this.burst(ctx, 1400, 0.09, Math.min(0.12, gain * 0.4), "highpass");
	}

	finishSting() {
		const ctx = this.ensure();
		if (!ctx) return;
		if (this.playSfx("finish", 0.28, 1)) return;
		this.tone(ctx, 523, 0.18, 0.2, ctx.currentTime);
		this.tone(ctx, 784, 0.24, 0.16, ctx.currentTime + 0.09);
	}

	/** Soft one-shot when a checkpoint index advances. */
	checkpointChirp() {
		const ctx = this.ensure();
		if (!ctx) return;
		if (this.playSfx("checkpoint", 0.2, 1)) return;
		this.tone(ctx, 660, 0.08, 0.1, ctx.currentTime, "triangle");
		this.tone(ctx, 880, 0.1, 0.08, ctx.currentTime + 0.06, "triangle");
	}

	/** Continuous slosh bed. Energy below the threshold fades it out. */
	sloshTick(energy: number, cutoff = 140) {
		const ctx = this.ensure();
		if (!ctx) return;
		const t = ctx.currentTime;
		const gain = sloshGainFor(energy);
		if (this.sampleSlosh) {
			this.sampleSlosh.source.playbackRate.setTargetAtTime(
				0.75 + Math.min(0.5, energy * 0.2),
				t,
				0.12,
			);
			this.sampleSlosh.filter?.frequency.setTargetAtTime(
				cutoff * 8 + Math.min(600, energy * 200),
				t,
				0.12,
			);
			softGainRamp(this.sampleSlosh.gain.gain, gain * 1.35, t, 0.1);
			if (this.slosh) softGainRamp(this.slosh.gain.gain, 0, t, 0.1);
			return;
		}
		if (!this.slosh) return;
		this.slosh.filter.frequency.setTargetAtTime(
			cutoff + Math.min(80, energy * 40),
			t,
			0.12,
		);
		softGainRamp(this.slosh.gain.gain, gain, t, 0.1);
	}

	/** One short tone at the lip or on a spill. Calm frames start nothing. */
	lipAccent(gain: number) {
		if (gain <= 0) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastSlosh < 0.2) return;
		this.lastSlosh = t;
		if (this.playSfx("lip", gain * 1.4, 1)) return;
		this.tone(ctx, 168, 0.07, gain, t, "sine");
	}

	private applyMaster() {
		const ctx = this.ctx;
		if (!ctx || !this.master) return;
		softGainRamp(
			this.master.gain,
			softMuteTarget(this._enabled, this._volume, this._music),
			ctx.currentTime,
			0.05,
		);
		if (this.duck)
			softGainRamp(this.duck.gain, this._ducked ? 0 : 1, ctx.currentTime, 0.08);
		if (this.sfxBus)
			softGainRamp(
				this.sfxBus.gain,
				this._enabled ? 1 : 0,
				ctx.currentTime,
				0.05,
			);
		if (this.musicBus)
			softGainRamp(
				this.musicBus.gain,
				this._music ? musicGroupGainFor(this._volume) : 0,
				ctx.currentTime,
				0.08,
			);
	}

	private silence() {
		this.silenceSfx();
		this.silenceMusic();
	}

	private silenceSfx() {
		const ctx = this.ctx;
		if (!ctx) return;
		const t = ctx.currentTime;
		const nodes = [
			this.engineGain,
			this.bodyGain,
			this.harmonicGain,
			this.subGain,
			this.scrub?.gain,
			this.exhaust?.gain,
			this.roll?.gain,
			this.slosh?.gain,
			this.wind?.gain,
			this.sampleEngine?.gain,
			this.sampleExhaust?.gain,
			this.sampleScrub?.gain,
			this.sampleRoll?.gain,
			this.sampleRollSand?.gain,
			this.sampleSlosh?.gain,
			this.sampleWind?.gain,
		];
		for (const node of nodes) {
			if (!node) continue;
			softGainRamp(node.gain, 0, t, 0.05);
		}
	}

	private silenceMusic() {
		const ctx = this.ctx;
		if (!ctx) return;
		const t = ctx.currentTime;
		this.silenceMusicVoices(t);
		if (this.musicBus) softGainRamp(this.musicBus.gain, 0, t, 0.08);
		this.nextMusicBeat = -1;
	}

	private ensure(): AudioContext | null {
		if (!this.armed) return null;
		this.create();
		if (!this._enabled) return null;
		return this.ctx;
	}

	private ensureMusic(): AudioContext | null {
		if (!this.armed) return null;
		this.create();
		if (!this._music) return null;
		return this.ctx;
	}

	private beginSampleLoad() {
		if (this.loadStarted || !this.ctx) return;
		this.loadStarted = true;
		const ctx = this.ctx;
		void loadGameAudio(ctx)
			.then((buffers) => {
				if (this.ctx !== ctx) return;
				this.buffers = buffers;
				this.attachSamples();
			})
			.catch(() => {
				/* Keep the procedural mix when samples cannot load. */
			});
	}

	private attachSamples() {
		const ctx = this.ctx;
		const buffers = this.buffers;
		const sfxBus = this.sfxBus;
		const musicBus = this.musicBus;
		if (!ctx || !buffers || !sfxBus || !musicBus) return;

		if (buffers.sfx.engine) {
			this.sampleEngine = this.sampleLoop(ctx, sfxBus, buffers.sfx.engine);
			this.usingSampleEngine = true;
			const t = ctx.currentTime;
			for (const node of [
				this.engineGain,
				this.bodyGain,
				this.harmonicGain,
				this.subGain,
				this.exhaust?.gain,
			]) {
				if (node) softGainRamp(node.gain, 0, t, 0.05);
			}
		}
		if (buffers.sfx.exhaust)
			this.sampleExhaust = this.sampleLoop(ctx, sfxBus, buffers.sfx.exhaust);
		if (buffers.sfx.scrub)
			this.sampleScrub = this.sampleLoop(ctx, sfxBus, buffers.sfx.scrub);
		if (buffers.sfx.roll)
			this.sampleRoll = this.sampleLoop(ctx, sfxBus, buffers.sfx.roll);
		if (buffers.sfx.rollSand)
			this.sampleRollSand = this.sampleLoop(ctx, sfxBus, buffers.sfx.rollSand);
		if (buffers.sfx.slosh) {
			const filter = ctx.createBiquadFilter();
			filter.type = "lowpass";
			filter.frequency.value = 1200;
			filter.Q.value = 0.5;
			this.sampleSlosh = this.sampleLoop(
				ctx,
				sfxBus,
				buffers.sfx.slosh,
				filter,
			);
		}
		if (buffers.sfx.wind)
			this.sampleWind = this.sampleLoop(ctx, sfxBus, buffers.sfx.wind);

		if (hasMusicStems(buffers)) {
			const bedFilter = ctx.createBiquadFilter();
			bedFilter.type = "lowpass";
			bedFilter.frequency.value = 2400;
			bedFilter.Q.value = 0.5;
			const leadFilter = ctx.createBiquadFilter();
			leadFilter.type = "bandpass";
			leadFilter.frequency.value = 1800;
			leadFilter.Q.value = 0.7;
			this.sampleMusic.bed = this.sampleLoop(
				ctx,
				musicBus,
				buffers.music.bed!,
				bedFilter,
			);
			this.sampleMusic.bass = this.sampleLoop(
				ctx,
				musicBus,
				buffers.music.bass!,
			);
			this.sampleMusic.drive = this.sampleLoop(
				ctx,
				musicBus,
				buffers.music.drive!,
			);
			this.sampleMusic.lead = this.sampleLoop(
				ctx,
				musicBus,
				buffers.music.lead!,
				leadFilter,
			);
			this.usingSampleMusic = true;
			this.silenceProceduralMusic(ctx.currentTime);
		}
	}

	private silenceProceduralMusic(t: number) {
		const nodes = [
			this.padGain,
			this.bass?.gain,
			this.pulse?.gain,
			this.lead?.gain,
			this.tension?.gain,
			this.air?.gain,
			this.hat?.gain,
			this.musicHit,
		];
		for (const node of nodes) {
			if (!node) continue;
			softGainRamp(node.gain, 0, t, 0.05);
		}
	}

	private sampleLoop(
		ctx: AudioContext,
		dest: AudioNode,
		buffer: AudioBuffer,
		filter?: BiquadFilterNode,
	): SampleVoice {
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(dest);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		if (filter) {
			source.connect(filter);
			filter.connect(gain);
		} else {
			source.connect(gain);
		}
		source.start();
		return { source, gain, filter };
	}

	private playSfx(key: SfxBufferKey, gain: number, rate = 1): boolean {
		const ctx = this.ctx;
		const buffer = this.buffers?.sfx[key];
		if (!ctx || !this.master || !buffer || gain <= 0) return false;
		const t = ctx.currentTime;
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.playbackRate.value = rate;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
		g.gain.exponentialRampToValueAtTime(
			0.0001,
			t + Math.max(0.08, buffer.duration / rate),
		);
		src.connect(g);
		g.connect(this.master);
		src.start(t);
		src.stop(t + buffer.duration / rate + 0.05);
		return true;
	}

	private create() {
		if (this.ctx || !this.armed) return;
		const ctx = new AudioContext();
		this.ctx = ctx;
		const master = ctx.createGain();
		master.gain.value = masterGainFor(this._volume);
		this.master = master;

		const compressor = ctx.createDynamicsCompressor();
		compressor.threshold.value = -18;
		compressor.knee.value = 12;
		compressor.ratio.value = 3;
		compressor.attack.value = 0.003;
		compressor.release.value = 0.12;
		compressor.connect(ctx.destination);
		master.connect(compressor);

		const duck = ctx.createGain();
		duck.gain.value = this._ducked ? 0 : 1;
		duck.connect(master);
		this.duck = duck;

		const sfxBus = ctx.createGain();
		sfxBus.gain.value = this._enabled ? 1 : 0;
		sfxBus.connect(duck);
		this.sfxBus = sfxBus;

		const musicBus = ctx.createGain();
		musicBus.gain.value = this._music ? musicGroupGainFor(this._volume) : 0;
		musicBus.connect(duck);
		this.musicBus = musicBus;

		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 420;
		filter.Q.value = 0.6;
		const engineGain = ctx.createGain();
		engineGain.gain.value = 0;
		filter.connect(engineGain);
		engineGain.connect(sfxBus);
		this.engineFilter = filter;
		this.engineGain = engineGain;

		this.engine = this.osc(ctx, "sawtooth", 55, filter);
		const bodyGain = ctx.createGain();
		bodyGain.gain.value = 0;
		bodyGain.connect(filter);
		this.bodyGain = bodyGain;
		this.engineBody = this.osc(ctx, "sawtooth", 54, bodyGain);

		const harmonicGain = ctx.createGain();
		harmonicGain.gain.value = 0;
		harmonicGain.connect(sfxBus);
		this.harmonicGain = harmonicGain;
		this.engineHarmonic = this.osc(ctx, "triangle", 110, harmonicGain);

		const subGain = ctx.createGain();
		subGain.gain.value = 0;
		subGain.connect(sfxBus);
		this.subGain = subGain;
		this.engineSub = this.osc(ctx, "sine", 28, subGain);

		this.scrub = this.loop(ctx, sfxBus, "bandpass", 900, 0.8);
		this.exhaust = this.loop(ctx, sfxBus, "bandpass", 180, 0.7);
		this.roll = this.loop(ctx, sfxBus, "lowpass", 900, 0.4);
		this.slosh = this.loop(ctx, sfxBus, "lowpass", 160, 0.5);
		this.wind = this.loop(ctx, sfxBus, "bandpass", 1100, 0.35);

		const padFilter = ctx.createBiquadFilter();
		padFilter.type = "lowpass";
		padFilter.frequency.value = 520;
		padFilter.Q.value = 0.5;
		const padGain = ctx.createGain();
		padGain.gain.value = 0;
		padFilter.connect(padGain);
		padGain.connect(musicBus);
		this.padFilter = padFilter;
		this.padGain = padGain;
		this.osc(ctx, "sine", MUSIC_ROOT, padFilter);
		this.osc(ctx, "sine", MUSIC_ROOT * (3 / 2) * 0.997, padFilter);
		this.osc(ctx, "triangle", MUSIC_ROOT * 2 * 1.003, padFilter);

		this.bass = this.scoreVoice(
			ctx,
			musicBus,
			"sawtooth",
			MUSIC_ROOT,
			"lowpass",
			180,
			0.9,
		);
		this.pulse = this.scoreVoice(
			ctx,
			musicBus,
			"triangle",
			MUSIC_ROOT * 2,
			"lowpass",
			640,
			0.7,
		);
		this.lead = this.scoreVoice(
			ctx,
			musicBus,
			"square",
			MUSIC_ROOT * 4,
			"bandpass",
			1200,
			1.1,
		);
		this.tension = this.scoreVoice(
			ctx,
			musicBus,
			"sawtooth",
			MUSIC_ROOT * 2.05,
			"bandpass",
			700,
			1.4,
		);
		this.air = this.scoreVoice(
			ctx,
			musicBus,
			"triangle",
			MUSIC_ROOT * 4 * (3 / 2),
			"highpass",
			900,
			0.6,
		);
		this.hat = this.loop(ctx, musicBus, "highpass", 5000, 0.7);
		const hit = ctx.createGain();
		hit.gain.value = 0;
		hit.connect(musicBus);
		this.musicHit = hit;
		this.musicKick = this.osc(ctx, "sine", 70, hit);
		this.musicBeat = 0;
		this.nextMusicBeat = -1;
	}

	private scoreVoice(
		ctx: AudioContext,
		dest: AudioNode,
		type: OscillatorType,
		freq: number,
		filterType: BiquadFilterType,
		filterFreq: number,
		q: number,
	): ScoreVoice {
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(dest);
		const filter = ctx.createBiquadFilter();
		filter.type = filterType;
		filter.frequency.value = filterFreq;
		filter.Q.value = q;
		filter.connect(gain);
		const osc = this.osc(ctx, type, freq, filter);
		return { osc, gain, filter };
	}

	private osc(
		ctx: AudioContext,
		type: OscillatorType,
		freq: number,
		dest: AudioNode,
	) {
		const node = ctx.createOscillator();
		node.type = type;
		node.frequency.value = freq;
		node.connect(dest);
		node.start();
		return node;
	}

	private loop(
		ctx: AudioContext,
		dest: AudioNode,
		type: BiquadFilterType,
		freq: number,
		q: number,
	): Loop {
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = freq;
		filter.Q.value = q;
		const gain = ctx.createGain();
		gain.gain.value = 0;
		const src = ctx.createBufferSource();
		src.buffer = this.noiseBuffer(ctx);
		src.loop = true;
		src.connect(filter);
		filter.connect(gain);
		gain.connect(dest);
		src.start();
		return { filter, gain };
	}

	private noiseBuffer(ctx: AudioContext): AudioBuffer {
		if (this.noise) return this.noise;
		const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		this.noise = buf;
		return buf;
	}

	private tone(
		ctx: AudioContext,
		freq: number,
		dur: number,
		gain: number,
		when: number,
		type: OscillatorType = "triangle",
	) {
		if (!this.master) return;
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, when);
		if (type === "sine")
			osc.frequency.exponentialRampToValueAtTime(48, when + dur);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		osc.connect(g);
		g.connect(this.master);
		osc.start(when);
		osc.stop(when + dur + 0.02);
	}

	private burst(
		ctx: AudioContext,
		freq: number,
		dur: number,
		gain: number,
		filterType: BiquadFilterType,
	) {
		if (!this.master) return;
		const t = ctx.currentTime;
		const src = ctx.createBufferSource();
		src.buffer = this.noiseBuffer(ctx);
		const filter = ctx.createBiquadFilter();
		filter.type = filterType;
		filter.frequency.value = freq;
		filter.Q.value = 0.7;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(filter);
		filter.connect(g);
		g.connect(this.master);
		src.start(t);
		src.stop(t + dur + 0.02);
	}
}
