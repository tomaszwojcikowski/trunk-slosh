import type { Vec2 } from "../math/vec2";

/** Pickup axles the current art was drawn against. */
export const PICKUP_A = 1.3;
export const PICKUP_B = 1.35;

export type AxleWheel = { x: number; y: number; steer: boolean };

/** Four wheel positions from the tire model's axle distances. */
export function axleLayout(a: number, b: number): AxleWheel[] {
	return [
		{ x: a, y: -0.9, steer: true },
		{ x: a, y: 0.9, steer: true },
		{ x: -b, y: -0.92, steer: false },
		{ x: -b, y: 0.92, steer: false },
	];
}

/**
 * Scale the nose with the front axle and the tail with the rear axle.
 * The cab and the bed opening stay put.
 */
export function scaledBodyPoint(p: Vec2, a: number, b: number): Vec2 {
	if (p.x > 1) return { x: p.x * (a / PICKUP_A), y: p.y };
	if (p.x < -1.7) return { x: p.x * (b / PICKUP_B), y: p.y };
	return p;
}
