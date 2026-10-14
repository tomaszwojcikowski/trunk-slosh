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
	/** False on intro / when music is muted in settings. */
	active: boolean;
};

/** Normalized layer gains (0…1) before the bus applies headroom. */
export type MusicMix = {
	/** Soft desert pad — always under the bed when active. */
	bed: number;
	/** Pulse that opens with road speed. */
	drive: number;
	/** Dissonant lift from slosh and cargo threat. */
	tension: number;
	/** Open air lift while airborne. */
	air: number;
	/** Short intensity kick after a hard hit. */
	hit: number;
};

const SILENT: MusicMix = {
	bed: 0,
	drive: 0,
	tension: 0,
	air: 0,
	hit: 0,
};

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
 * Map gameplay drivers to music layer gains.
 * Pure and side-effect free so tests can pin the curve without Web Audio.
 */
export function musicMixFor(d: MusicDrivers): MusicMix {
	if (!d.active) return { ...SILENT };

	const speed = Math.max(0, d.speed);
	const slosh = Math.max(0, d.slosh);
	const impact = Math.max(0, d.impact);
	const near = clamp01(d.nearMiss);

	const bed = 0.55 + Math.min(0.35, speed * 0.012);
	const drive =
		speed < 1.5 ? 0 : clamp01((speed - 1.5) / 28) * (d.airborne ? 0.35 : 1);
	const tension = clamp01(
		threatBias(d.threat) * 0.55 +
			(slosh < 0.12 ? 0 : Math.min(1, (slosh - 0.12) * 0.55)) * 0.7 +
			near * 0.85,
	);
	const air = d.airborne ? clamp01(0.45 + Math.min(speed, 24) * 0.018) : 0;
	const hit = impact < 25 ? 0 : clamp01((impact - 25) / 70);

	return { bed, drive, tension, air, hit };
}

/** Bus headroom for the music group (under SFX). */
export function musicGroupGainFor(volume: number): number {
	return Math.max(0, Math.min(1, volume)) * 0.22;
}
