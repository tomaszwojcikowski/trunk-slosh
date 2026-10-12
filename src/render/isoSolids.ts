import type { Vec2 } from "../math/vec2";

export type Projector = (x: number, y: number, z: number) => Vec2;

export function signedArea(pts: Vec2[]): number {
	let a = 0;
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const q = pts[(i + 1) % pts.length];
		a += p.x * q.y - q.x * p.y;
	}
	return a / 2;
}

export function centroid(pts: Vec2[]): Vec2 {
	let x = 0;
	let y = 0;
	for (const p of pts) {
		x += p.x;
		y += p.y;
	}
	return { x: x / pts.length, y: y / pts.length };
}

/** Andrew's monotone chain; returns the hull counter-clockwise without repeating the first point. */
export function convexHull(points: Vec2[]): Vec2[] {
	const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	if (pts.length < 3) return pts;
	const cross = (o: Vec2, a: Vec2, b: Vec2) =>
		(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Vec2[] = [];
	for (const p of pts) {
		while (
			lower.length >= 2 &&
			cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
		)
			lower.pop();
		lower.push(p);
	}
	const upper: Vec2[] = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i];
		while (
			upper.length >= 2 &&
			cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
		)
			upper.pop();
		upper.push(p);
	}
	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

export type SideFace = {
	/** Screen-space quad: bottom i, bottom i+1, top i+1, top i */
	quad: Vec2[];
	/** Outward horizontal normal in world space */
	normal: Vec2;
	/** Painter's key (world x + y of the edge midpoint) */
	depth: number;
};

/**
 * Visible side faces of a vertical frustum between `base` at z0 and `top` at z1 (same vertex
 * order). A side face is front-facing when its projected winding matches the top face, which
 * always faces an iso camera looking down.
 */
export function frustumSideFaces(
	base: Vec2[],
	top: Vec2[],
	z0: number,
	z1: number,
	project: Projector,
	lift?: (index: number) => number,
): { faces: SideFace[]; topScreen: Vec2[] } {
	const B = base.map((p, i) => project(p.x, p.y, z0 + (lift?.(i) ?? 0)));
	const T = top.map((p, i) => project(p.x, p.y, z1 + (lift?.(i) ?? 0)));
	const topSign = Math.sign(signedArea(T)) || 1;
	const c = centroid(base);
	const faces: SideFace[] = [];
	for (let i = 0; i < base.length; i++) {
		const j = (i + 1) % base.length;
		const quad = [B[i], B[j], T[j], T[i]];
		if (Math.sign(signedArea(quad)) !== topSign) continue;
		const ex = base[j].x - base[i].x;
		const ey = base[j].y - base[i].y;
		const el = Math.hypot(ex, ey) || 1;
		let n = { x: ey / el, y: -ex / el };
		const mx = (base[i].x + base[j].x) / 2;
		const my = (base[i].y + base[j].y) / 2;
		if (n.x * (mx - c.x) + n.y * (my - c.y) < 0) n = { x: -n.x, y: -n.y };
		faces.push({ quad, normal: n, depth: mx + my });
	}
	faces.sort((a, b) => a.depth - b.depth);
	return { faces, topScreen: T };
}
