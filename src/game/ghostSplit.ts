/** Signed time split versus the ghost. Ahead (faster) is negative. */
export function ghostSplitSeconds(
	playerElapsed: number,
	ghostElapsed: number,
): number {
	return playerElapsed - ghostElapsed;
}

/**
 * HUD label for the ghost split. Null when no ghost is active.
 * Equal clocks read `0.0s`.
 */
export function ghostSplitLabel(
	playerElapsed: number,
	ghostElapsed: number,
	active: boolean,
): string | null {
	if (!active) return null;
	const split = ghostSplitSeconds(playerElapsed, ghostElapsed);
	const abs = Math.abs(split).toFixed(1);
	if (Math.abs(split) < 0.05) return "0.0s";
	return `${split < 0 ? "−" : "+"}${abs}s`;
}
