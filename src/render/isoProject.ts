/** Classic 2:1 dimetric projection (30° axes), z in meters scaled for readability. */
export const ISO_COS = Math.sqrt(3) / 2;
export const ISO_SIN = 0.5;

export type IsoCamera = {
	x: number;
	y: number;
	/** Optional screen-space roll in radians. */
	roll?: number;
};

export type IsoGroundTransform = {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
};

export function isoProject(
	x: number,
	y: number,
	z: number,
	zScale = 1.25,
): { x: number; y: number } {
	return {
		x: (x - y) * ISO_COS,
		y: (x + y) * ISO_SIN - z * zScale,
	};
}

/** Sort key for painter's algorithm (farther = smaller y in screen space). */
export function isoDepth(x: number, y: number, z: number): number {
	return x + y - z * 0.35;
}

export function isoWorldToScreen(
	x: number,
	y: number,
	z: number,
	camera: IsoCamera,
	scale: number,
	screenW: number,
	screenH: number,
): { x: number; y: number } {
	const p = isoProject(x - camera.x, y - camera.y, z);
	const roll = camera.roll ?? 0;
	const cr = Math.cos(roll);
	const sr = Math.sin(roll);
	return {
		x: screenW / 2 + (p.x * cr - p.y * sr) * scale,
		y: screenH / 2 + (p.x * sr + p.y * cr) * scale,
	};
}

export function isoGroundTransform(
	camera: IsoCamera,
	scale: number,
	screenW: number,
	screenH: number,
): IsoGroundTransform {
	const roll = camera.roll ?? 0;
	const cr = Math.cos(roll);
	const sr = Math.sin(roll);
	const a = (cr * ISO_COS - sr * ISO_SIN) * scale;
	const b = (sr * ISO_COS + cr * ISO_SIN) * scale;
	const c = (-cr * ISO_COS - sr * ISO_SIN) * scale;
	const d = (-sr * ISO_COS + cr * ISO_SIN) * scale;
	return {
		a,
		b,
		c,
		d,
		e: screenW / 2 - a * camera.x - c * camera.y,
		f: screenH / 2 - b * camera.x - d * camera.y,
	};
}

export function isoCameraPixelOffset(camera: IsoCamera, scale: number) {
	const p = isoProject(camera.x, camera.y, 0);
	return { x: p.x * scale, y: p.y * scale };
}
