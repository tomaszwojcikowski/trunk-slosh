import type { ObstacleKind } from "../world/Track";
import type { SfxBufferKey } from "./assets";

/** Quiet under the floor. Airborne keeps a thin residual so a jump is not a stall. */
export function windGainFor(speed: number, airborne: boolean): number {
	if (speed < 2.5) return 0;
	const base = Math.min(0.055, (speed - 2.5) * 0.0024);
	return airborne ? base * 0.35 : base;
}

export type ImpactVoice = {
	freq: number;
	filter?: number;
	/** Sample key when real buffers are loaded. */
	sample: SfxBufferKey;
};

const IMPACT_VOICES: Record<ObstacleKind, ImpactVoice> = {
	rock: { freq: 62, filter: 180, sample: "impactSoft" },
	cactus: { freq: 88, filter: 420, sample: "impactWood" },
	barrel: { freq: 110, filter: 520, sample: "impactMetal" },
	tires: { freq: 74, filter: 260, sample: "impactPlate" },
};

const DEFAULT_IMPACT: ImpactVoice = {
	freq: 68,
	sample: "impactGeneric",
};

/** Pitch/filter for a named prop hit. Unknown scrapes keep today's tone. */
export function impactVoiceFor(
	kind: ObstacleKind | string | null | undefined,
): ImpactVoice {
	if (kind && kind in IMPACT_VOICES) return IMPACT_VOICES[kind as ObstacleKind];
	return DEFAULT_IMPACT;
}
