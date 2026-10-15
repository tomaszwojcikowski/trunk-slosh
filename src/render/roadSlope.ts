import type { Vec2 } from "../math/vec2";
import { SUN } from "./sun";

/** Curb thickness under the ribbon so a grade casts a readable side silhouette (m). */
export const ROAD_CURB = 0.42;

/** Embankment under raised ribbon segments (m below the local edge). */
export const ROAD_EMBANK = 1.15;

export type Vec3 = { x: number; y: number; z: number };

/**
 * Upward unit normal of the road surface from longitudinal grade and cross-bank.
 * `tangent` / `normal` are the flat centerline basis; grade is dh/ds, bank is dh/d(lateral).
 */
export function roadSurfaceNormal(
	grade: number,
	bank: number,
	tangent: Vec2,
	normal: Vec2,
): Vec3 {
	const ax = tangent.x;
	const ay = tangent.y;
	const az = grade;
	const bx = normal.x;
	const by = normal.y;
	const bz = bank;
	let nx = ay * bz - az * by;
	let ny = az * bx - ax * bz;
	let nz = ax * by - ay * bx;
	if (nz < 0) {
		nx = -nx;
		ny = -ny;
		nz = -nz;
	}
	const len = Math.hypot(nx, ny, nz) || 1;
	return { x: nx / len, y: ny / len, z: nz / len };
}

/** −1…1 how much the face faces the sun (0 = grazing). */
export function faceLit(n: Vec3, sun = SUN): number {
	return n.x * sun.x + n.y * sun.y + n.z * sun.z;
}

/** Mix asphalt between shade / mid / lit from a surface lit factor. */
export function asphaltForLit(lit: number): string {
	if (lit > 0.55) return "#8a7a6a";
	if (lit > 0.25) return "#7a6c5f";
	if (lit > 0.05) return "#6a5c50";
	return "#5a4e44";
}

/** Shoulder tone that still reads as dirt when the ribbon tilts. */
export function shoulderForLit(lit: number): string {
	if (lit > 0.45) return "#b8834a";
	if (lit > 0.15) return "#a8733e";
	return "#8a5e32";
}

/** True when the grade or ramp crown should get a crease band. */
export function needsGradeCrease(absGrade: number, rampBump: number): boolean {
	return absGrade > 0.028 || rampBump > 0.45;
}

/** How strong a downhill/uphill arrow tint should be (0…1). */
export function gradeTint(absGrade: number): number {
	if (absGrade < 0.02) return 0;
	return Math.min(1, (absGrade - 0.02) / 0.08);
}

/** Signed bank amount that is worth a high-edge highlight. */
export function bankHighlight(absBank: number): number {
	if (absBank < 0.015) return 0;
	return Math.min(1, (absBank - 0.015) / 0.045);
}
