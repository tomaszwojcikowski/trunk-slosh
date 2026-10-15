import type { CargoThreat } from "../game/cargoThreat";

/** Gameplay signals that drive the adaptive music mix. */
export type MusicDrivers = {
	/** Chassis speed in m/s. */
	speed: number;
	/** Surface slosh energy from the fluid solver. */
	slosh: number;
	/** Cargo bar threat for the active mode. */
	threat: CargoThreat;
	/**
	 * 0…1 how close the truck is to clipping a prop (1 = grazing).
	 * Built from clearance to the nearest obstacle.
	 */
	nearMiss: number;
	/** True while the truck has left the ribbon. */
	airborne: boolean;
	/** Latest impact magnitude (0 when calm). */
	impact: number;
	/** False when music is muted or the run is paused/finished. */
	active: boolean;
};

/** Normalized layer gains (0…1) before the bus applies headroom. */
export type MusicMix = {
	/** Soft desert pad under everything. */
	bed: number;
	/** Groove / pulse weight that opens with road speed. */
	drive: number;
	/** Bass presence — follows the pulse. */
	bass: number;
	/** Melodic ostinato activity. */
	lead: number;
	/** Dissonant lift from slosh, threat, and near-miss. */
	tension: number;
	/** Open air lift while airborne. */
	air: number;
	/** Short intensity kick after a hard hit. */
	hit: number;
	/** Overall heat 0…1 — opens filters and hat energy. */
	intensity: number;
	/** Tempo for the score sequencer (BPM). */
	bpm: number;
};

const SILENT: MusicMix = {
	bed: 0,
	drive: 0,
	bass: 0,
	lead: 0,
	tension: 0,
	air: 0,
	hit: 0,
	intensity: 0,
	bpm: 0,
};

/** D natural minor desert palette (Hz). */
export const MUSIC_ROOT = 73.42; // D2

/** Bass ostinato degrees relative to MUSIC_ROOT (×2^n/12). */
export const BASS_STEPS = [0, 0, 7, 5, 0, 3, 7, 10] as const;

/** Lead arpeggio degrees (one octave up). */
export const LEAD_STEPS = [12, 15, 19, 22, 19, 15, 17, 12] as const;

/** Darker lead when tension is high. */
export const LEAD_TENSE_STEPS = [12, 13, 15, 18, 15, 13, 16, 12] as const;

function clamp01(n: number): number {
	return Math.max(0, Math.min(1, n));
}

/** Threat as a 0…1 tension bias. */
export function threatBias(threat: CargoThreat): number {
	if (threat === "danger") return 1;
	if (threat === "warn") return 0.55;
	return 0;
}

/**
 * Map gap past a prop into a near-miss intensity.
 * Outside `horizon` meters of clearance the score stays quiet.
 */
export function nearMissFor(clearance: number, horizon = 4.5): number {
	if (!Number.isFinite(clearance) || clearance >= horizon) return 0;
	if (clearance <= 0) return 1;
	return clamp01(1 - clearance / horizon);
}

/**
 * Chase tempo around the Colorosse Arcade stem rate (152 BPM).
 * Parked stays musical; speed opens the groove without pitching stems into chipmunks.
 */
export function musicBpmFor(speed: number, active: boolean): number {
	if (!active) return 0;
	const s = Math.max(0, speed);
	return 128 + Math.min(40, s * 1.2);
}

/** MIDI-style degree → Hz from MUSIC_ROOT. */
export function degreeHz(degree: number, root = MUSIC_ROOT): number {
	return root * 2 ** (degree / 12);
}

export function bassNoteHz(step: number): number {
	const deg =
		BASS_STEPS[
			((step % BASS_STEPS.length) + BASS_STEPS.length) % BASS_STEPS.length
		];
	return degreeHz(deg);
}

export function leadNoteHz(step: number, tense: boolean): number {
	const table = tense ? LEAD_TENSE_STEPS : LEAD_STEPS;
	const deg = table[((step % table.length) + table.length) % table.length];
	return degreeHz(deg);
}

/**
 * Map gameplay drivers to music layer gains.
 * Pure and side-effect free so tests can pin the curve without Web Audio.
 */
export function musicMixFor(d: MusicDrivers): MusicMix {
	if (!d.active) return { ...SILENT };

	const speed = Math.max(0, d.speed);
	const slosh = Math.max(0, d.slosh);
	const impact = Math.max(0, d.impact);
	const near = clamp01(d.nearMiss);
	const threat = threatBias(d.threat);
	const bpm = musicBpmFor(speed, true);

	const cruise = clamp01(speed / 22);
	const bed = 0.72 + cruise * 0.28;
	const drive = 0.22 + cruise * 0.78;
	const bass = 0.35 + cruise * 0.65;
	const lead = clamp01(0.12 + cruise * 0.75 + threat * 0.15 + near * 0.2);
	const tension = clamp01(
		threat * 0.55 +
			(slosh < 0.12 ? 0 : Math.min(1, (slosh - 0.12) * 0.55)) * 0.7 +
			near * 0.9,
	);
	const air = d.airborne ? clamp01(0.55 + Math.min(speed, 24) * 0.02) : 0;
	const hit = impact < 25 ? 0 : clamp01((impact - 25) / 55);
	const intensity = clamp01(
		cruise * 0.55 + tension * 0.35 + air * 0.2 + hit * 0.25,
	);

	// Airborne: keep pulse alive but thin the groove so the air pad reads.
	const airMul = d.airborne ? 0.45 : 1;
	return {
		bed,
		drive: drive * airMul,
		bass: bass * (d.airborne ? 0.55 : 1),
		lead: lead * (d.airborne ? 0.7 : 1),
		tension,
		air,
		hit,
		intensity,
		bpm,
	};
}

/** Bus headroom for the music group (under SFX, but audible). */
export function musicGroupGainFor(volume: number): number {
	return Math.max(0, Math.min(1, volume)) * 0.42;
}
