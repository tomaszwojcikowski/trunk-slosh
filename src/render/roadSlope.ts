import type { Vec2 } from "../math/vec2";
import { SUN } from "./sun";

/** Curb thickness under the ribbon so a grade casts a readable side silhouette (m). */
export const ROAD_CURB = 0.55;

/** Embankment under raised ribbon segments (m below the local edge). */
export const ROAD_EMBANK = 1.6;

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

/**
 * Amplified shade score for comic readability.
 * Real canyon grades (~0.08) barely tilt a geometric normal, so we bias by |grade|/|bank|.
 */
export function roadShadeScore(
	lit: number,
	grade: number,
	bank: number,
): number {
	const steep = Math.min(1.4, Math.abs(grade) * 10 + Math.abs(bank) * 14);
	// Climbing into the sun stays lighter; climbing away goes darker.
	const alongSun = grade * SUN.x * 0.15; // rough bias; grade>0 is downhill along +t in our force model
	return lit - steep * 0.42 + alongSun;
}

/** Mix asphalt between shade / mid / lit from an amplified shade score. */
export function asphaltForLit(score: number): string {
	if (score > 0.7) return "#958677";
	if (score > 0.45) return "#7a6c5f";
	if (score > 0.2) return "#63564b";
	if (score > 0) return "#4f443c";
	return "#3c342e";
}

/** Shoulder tone that still reads as dirt when the ribbon tilts. */
export function shoulderForLit(score: number): string {
	if (score > 0.5) return "#c99458";
	if (score > 0.2) return "#a8733e";
	if (score > 0) return "#8a5e32";
	return "#6e4a28";
}

/** True when the grade or ramp crown should get a crease band. */
export function needsGradeCrease(absGrade: number, rampBump: number): boolean {
	return absGrade > 0.02 || rampBump > 0.4;
}

/** How strong a downhill/uphill arrow tint should be (0…1). */
export function gradeTint(absGrade: number): number {
	if (absGrade < 0.015) return 0;
	return Math.min(1, (absGrade - 0.015) / 0.07);
}

/** Signed bank amount that is worth a high-edge highlight. */
export function bankHighlight(absBank: number): number {
	if (absBank < 0.012) return 0;
	return Math.min(1, (absBank - 0.012) / 0.04);
}

/** Embankment depth under an edge given local grade and absolute height. */
export function embankDepth(
	archetype: "flats" | "canyon" | "boulder",
	absGrade: number,
	absHeight: number,
): number {
	if (archetype === "flats" && absGrade < 0.02) return ROAD_CURB;
	const extra = Math.min(ROAD_EMBANK, 0.45 + absGrade * 8 + absHeight * 0.35);
	return ROAD_CURB + extra;
}
