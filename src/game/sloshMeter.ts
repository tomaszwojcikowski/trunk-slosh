export type SloshBand = "calm" | "moving" | "lip";

/** Enter thresholds. Lip accent and spill still use these via sloshLevel. */
export const SLOSH_MOVING_ENTER = 0.08;
export const SLOSH_LIP_ENTER = 0.35;
/** Exit thresholds sit below enter so a noisy surface does not flicker the HUD. */
export const SLOSH_MOVING_EXIT = 0.05;
export const SLOSH_LIP_EXIT = 0.3;

/** Pure read of FluidLayer.sloshSpeed. Calm below 0.08, moving below 0.35, otherwise at the lip. */
export function sloshLevel(speed: number): SloshBand {
	if (speed < SLOSH_MOVING_ENTER) return "calm";
	if (speed < SLOSH_LIP_ENTER) return "moving";
	return "lip";
}

/**
 * HUD band with hysteresis. Enter at the same thresholds as sloshLevel; leave lower.
 * Does not change spill or lip-accent signals — those keep using sloshLevel.
 */
export function nextSloshBand(prev: SloshBand, speed: number): SloshBand {
	if (prev === "lip") {
		if (speed >= SLOSH_LIP_EXIT) return "lip";
		if (speed >= SLOSH_MOVING_ENTER) return "moving";
		return "calm";
	}
	if (prev === "moving") {
		if (speed >= SLOSH_LIP_ENTER) return "lip";
		if (speed >= SLOSH_MOVING_EXIT) return "moving";
		return "calm";
	}
	return sloshLevel(speed);
}

export function sloshFill(speed: number): number {
	return Math.max(0, Math.min(1, speed / SLOSH_LIP_ENTER));
}
