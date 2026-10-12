/** Classic 2:1 dimetric projection (30° axes), z in meters scaled for readability. */
const COS = Math.sqrt(3) / 2;
const SIN = 0.5;

export function isoProject(
	x: number,
	y: number,
	z: number,
	zScale = 1.25,
): { x: number; y: number } {
	return {
		x: (x - y) * COS,
		y: (x + y) * SIN - z * zScale,
	};
}

/** Sort key for painter's algorithm (farther = smaller y in screen space). */
export function isoDepth(x: number, y: number, z: number): number {
	return x + y - z * 0.35;
}
