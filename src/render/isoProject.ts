/**
 * True isometric projection: the x, y and z axes are foreshortened equally and the ground
 * axes sit 30° off horizontal. Each world axis projects to a unit-length screen vector.
 */
export const ISO_COS = Math.sqrt(3) / 2;
export const ISO_SIN = 0.5;

export type IsoCamera = {
	x: number;
	y: number;
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
): { x: number; y: number } {
	return {
		x: (x - y) * ISO_COS,
		y: (x + y) * ISO_SIN - z,
	};
}

/** Painter's sort key: larger is closer to the viewer, who looks down from +x, +y, +z. */
export function isoDepth(x: number, y: number, z: number): number {
	return x + y + z;
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
	return { x: screenW / 2 + p.x * scale, y: screenH / 2 + p.y * scale };
}

/** Canvas matrix mapping ground-plane (z = 0) meters to scene pixels. */
export function isoGroundTransform(
	camera: IsoCamera,
	scale: number,
	screenW: number,
	screenH: number,
): IsoGroundTransform {
	const a = ISO_COS * scale;
	const b = ISO_SIN * scale;
	const c = -ISO_COS * scale;
	const d = ISO_SIN * scale;
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

/**
 * Projected-space cull. `h` is the drawn height in meters (z subtracts 1:1 from screen y),
 * so a prop whose base is just off-screen still draws when its top is inside the frame.
 */
export function isoInView(
	dx: number,
	dy: number,
	r: number,
	h: number,
	halfW: number,
	halfH: number,
): boolean {
	const sx = (dx - dy) * ISO_COS;
	const sy = (dx + dy) * ISO_SIN;
	const m = r * 1.3 + 1;
	return Math.abs(sx) < halfW + m && sy > -halfH - m && sy - h < halfH + m;
}
