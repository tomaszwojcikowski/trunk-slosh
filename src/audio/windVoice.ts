import type { ObstacleKind } from "../world/Track";

/** Quiet under the floor. Airborne keeps a thin residual so a jump is not a stall. */
export function windGainFor(speed: number, airborne: boolean): number {
	if (speed < 2.5) return 0;
	const base = Math.min(0.055, (speed - 2.5) * 0.0024);
	return airborne ? base * 0.35 : base;
}

export type ImpactVoice = { freq: number; filter?: number };

const IMPACT_VOICES: Record<ObstacleKind, ImpactVoice> = {
	rock: { freq: 62, filter: 180 },
	cactus: { freq: 88, filter: 420 },
	barrel: { freq: 110, filter: 520 },
	tires: { freq: 74, filter: 260 },
};

const DEFAULT_IMPACT: ImpactVoice = { freq: 68 };

/** Pitch/filter for a named prop hit. Unknown scrapes keep today's tone. */
export function impactVoiceFor(
	kind: ObstacleKind | string | null | undefined,
): ImpactVoice {
	if (kind && kind in IMPACT_VOICES) return IMPACT_VOICES[kind as ObstacleKind];
	return DEFAULT_IMPACT;
}
