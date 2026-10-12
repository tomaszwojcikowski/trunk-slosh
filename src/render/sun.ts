import type { Vec2 } from "../math/vec2";

/**
 * Direction toward the sun in world space (+z up). It sits to the viewer's upper left, so
 * screen-left faces are lit and screen-right faces fall in shade.
 */
export const SUN = (() => {
	const v = { x: -0.8, y: 0.45, z: 0.95 };
	const l = Math.hypot(v.x, v.y, v.z);
	return { x: v.x / l, y: v.y / l, z: v.z / l };
})();

/** Horizontal direction toward the sun. */
export const SUN_2D: Vec2 = (() => {
	const l = Math.hypot(SUN.x, SUN.y);
	return { x: SUN.x / l, y: SUN.y / l };
})();

/** Ground offset of a shadow cast from height `h` (m). */
export function shadowOffset(h: number): Vec2 {
	const k = h / Math.max(0.2, Math.tan(Math.asin(SUN.z)));
	return { x: -SUN_2D.x * k, y: -SUN_2D.y * k };
}
