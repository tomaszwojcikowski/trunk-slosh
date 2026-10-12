import type { Vec2 } from "../math/vec2";

/** Gravity used by the grade, bank, and ramp models (m/s²). Matter's own gravity stays at zero. */
export const GRADE_G = 9.81;

export const CANYON_AMP = 2.2;
export const CANYON_WAVE = 28;
/** Steepest canyon slope, dh/ds. A full tub's freeboard is about 0.27 m over a 1.3 m tub. */
export const MAX_CANYON_GRADE = CANYON_AMP / CANYON_WAVE;

export const BOULDER_STEP = 40;
export const BOULDER_RISE = 1.6;
export const BOULDER_RAMP = 18;

export const RAMP_HALF = 12;
export const RAMP_HEIGHT = 1.2;
export const WASH_HALF = 14;
export const WASH_DEPTH = 0.6;

export const BANK_GAIN = 8;
export const BANK_MAX = 0.06;

export type GradeArchetype = "flats" | "canyon" | "boulder";

const clamp = (x: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, x));

function smoothstep(t: number): number {
	const x = clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

/** Derivative of smoothstep on (0, 1); zero outside. */
function smoothstepDeriv(t: number): number {
	if (t <= 0 || t >= 1) return 0;
	return 6 * t * (1 - t);
}

/** Cosine hump, 1 at the center and 0 at ±half. */
export function cosineBump(s: number, center: number, half: number): number {
	const u = (s - center) / half;
	if (Math.abs(u) > 1) return 0;
	return 0.5 * (1 + Math.cos(Math.PI * u));
}

export function cosineBumpGrade(
	s: number,
	center: number,
	half: number,
): number {
	const u = (s - center) / half;
	if (Math.abs(u) >= 1) return 0;
	return (-0.5 * Math.sin(Math.PI * u) * Math.PI) / half;
}

export function profileHeight(archetype: GradeArchetype, s: number): number {
	if (archetype === "flats") return 0;
	if (archetype === "canyon") return CANYON_AMP * Math.sin(s / CANYON_WAVE);
	const n = Math.floor(s / BOULDER_STEP);
	const u = s - n * BOULDER_STEP;
	return (n + smoothstep(u / BOULDER_RAMP)) * BOULDER_RISE;
}

export function profileGrade(archetype: GradeArchetype, s: number): number {
	if (archetype === "flats") return 0;
	if (archetype === "canyon")
		return (CANYON_AMP / CANYON_WAVE) * Math.cos(s / CANYON_WAVE);
	const u = s - Math.floor(s / BOULDER_STEP) * BOULDER_STEP;
	return (BOULDER_RISE * smoothstepDeriv(u / BOULDER_RAMP)) / BOULDER_RAMP;
}

export type Furniture = { rampS: number; washS: number };

/** Canyon and boulder routes place one ramp and one dry wash. Flats stay level. */
export function furnitureFor(
	archetype: GradeArchetype,
	startS: number,
	finishS: number,
): Furniture | null {
	if (archetype === "flats") return null;
	const span = Math.max(1, finishS - startS);
	return {
		rampS: startS + span * 0.42,
		washS: startS + span * 0.62,
	};
}

export function featureHeight(s: number, furniture: Furniture | null): number {
	if (!furniture) return 0;
	return (
		RAMP_HEIGHT * cosineBump(s, furniture.rampS, RAMP_HALF) -
		WASH_DEPTH * cosineBump(s, furniture.washS, WASH_HALF)
	);
}

export function featureGrade(s: number, furniture: Furniture | null): number {
	if (!furniture) return 0;
	return (
		RAMP_HEIGHT * cosineBumpGrade(s, furniture.rampS, RAMP_HALF) -
		WASH_DEPTH * cosineBumpGrade(s, furniture.washS, WASH_HALF)
	);
}

export function roadHeight(
	archetype: GradeArchetype,
	s: number,
	furniture: Furniture | null,
): number {
	return profileHeight(archetype, s) + featureHeight(s, furniture);
}

export function roadGrade(
	archetype: GradeArchetype,
	s: number,
	furniture: Furniture | null,
): number {
	return profileGrade(archetype, s) + featureGrade(s, furniture);
}

export function inWashAt(s: number, furniture: Furniture | null): boolean {
	if (!furniture) return false;
	return Math.abs(s - furniture.washS) < WASH_HALF;
}

/** Positive curvature (left turn) banks so the outside of the bend is low. */
export function bankFromCurvature(curvature: number): number {
	return clamp(curvature * BANK_GAIN, -BANK_MAX, BANK_MAX);
}

/** Longitudinal gravity on the chassis (m/s², world axes). Downhill when grade > 0 is −tangent. */
export function gradeAccel(grade: number, tangent: Vec2): Vec2 {
	return { x: -GRADE_G * grade * tangent.x, y: -GRADE_G * grade * tangent.y };
}

/**
 * Body acceleration the liquid feels from the road (m/s², world axes).
 * Banking is the lateral term and replaces any cross-slope; it is not added on top of one.
 */
export function liquidBodyAccel(
	grade: number,
	bank: number,
	tangent: Vec2,
	normal: Vec2,
): Vec2 {
	const along = gradeAccel(grade, tangent);
	return {
		x: along.x - GRADE_G * bank * normal.x,
		y: along.y - GRADE_G * bank * normal.y,
	};
}
