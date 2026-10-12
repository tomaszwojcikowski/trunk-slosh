import type { Vec2 } from "../math/vec2";
import { ISO_SIN } from "./isoProject";

/**
 * World offset that sits the truck in the lower half of a fixed iso frame.
 * Screen-down is +(x+y); this bias is up-screen, toward −x and −y.
 */
export const FRAME_BIAS: Vec2 = { x: -6, y: -6 };

/**
 * Chase target in world meters. Speed looks ahead along the velocity, then the
 * iso vertical (x+y) clamps that lookahead so a heading toward the viewer cannot
 * push the truck into the upper half.
 */
export function chasePoint(
	pos: Vec2,
	vel: Vec2,
	bias: Vec2 = FRAME_BIAS,
): Vec2 {
	const speed = Math.hypot(vel.x, vel.y);
	let look = Math.min(1, speed / 25) * 0.55;
	const down = vel.x + vel.y;
	const biasSum = bias.x + bias.y;
	if (down > 1e-6) {
		const maxLook = (-0.5 - biasSum) / down;
		look = Math.min(look, Math.max(0, maxLook));
	}
	return {
		x: pos.x + vel.x * look + bias.x,
		y: pos.y + vel.y * look + bias.y,
	};
}

/** Projected meters of the truck below the camera center. Positive is the lower half. */
export function truckScreenY(truck: Vec2, cam: Vec2): number {
	return (truck.x - cam.x + (truck.y - cam.y)) * ISO_SIN;
}

export function truckInLowerHalf(truck: Vec2, cam: Vec2): boolean {
	return truckScreenY(truck, cam) > 0;
}

export function followChase(cam: Vec2, target: Vec2, dt: number): Vec2 {
	const k = 1 - 0.02 ** dt;
	return {
		x: cam.x + (target.x - cam.x) * k,
		y: cam.y + (target.y - cam.y) * k,
	};
}
