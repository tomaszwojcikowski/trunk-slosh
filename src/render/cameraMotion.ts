/** Reduced motion clears shake and the spill punch. It does not roll the iso axes. */
export function decayShake(
	shake: number,
	dt: number,
	reducedMotion: boolean,
): number {
	if (reducedMotion) return 0;
	return shake * 0.02 ** dt;
}

export function decayPunch(
	punch: number,
	dt: number,
	reducedMotion: boolean,
	punchEnabled: boolean,
): number {
	if (reducedMotion || !punchEnabled) return 0;
	return punch * 0.05 ** dt;
}

export function punchZoom(
	zoom: number,
	punch: number,
	reducedMotion: boolean,
	punchEnabled: boolean,
): number {
	if (reducedMotion || !punchEnabled || punch <= 0) return zoom;
	return zoom * (1 + punch * 0.08);
}
