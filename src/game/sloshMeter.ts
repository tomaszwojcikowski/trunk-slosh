export type SloshBand = "calm" | "moving" | "lip";

/** Pure read of FluidLayer.sloshSpeed. Calm below 0.08, moving below 0.35, otherwise at the lip. */
export function sloshLevel(speed: number): SloshBand {
	if (speed < 0.08) return "calm";
	if (speed < 0.35) return "moving";
	return "lip";
}

export function sloshFill(speed: number): number {
	return Math.max(0, Math.min(1, speed / 0.35));
}
