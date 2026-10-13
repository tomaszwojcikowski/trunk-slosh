export const WHEEL_RADIUS = 0.36;

/** Radians of wheel roll. Steering does not hold the mark; only speed does. */
export function advanceWheelAngle(
	angle: number,
	speed: number,
	dt: number,
): number {
	return angle + (Math.abs(speed) / WHEEL_RADIUS) * dt;
}

/** Radians of visual pitch. Positive lowers the nose (+local x) under braking. */
export const PITCH_PER_ACCEL = 0.012;

export function pitchFromLongAccel(ax: number): number {
	if (ax === 0) return 0;
	return -ax * PITCH_PER_ACCEL;
}

export function pitchedHeight(
	baseZ: number,
	localX: number,
	pitch: number,
): number {
	return baseZ - localX * pitch;
}

/** Visual pitch spring. Stiff enough that a hard brake still dips within ~0.3 s. */
export const PITCH_STIFFNESS = 90;
/** Critically damped-ish (≥ 2√k) so a step settles with at most one overshoot. */
export const PITCH_DAMPING = 20;

/**
 * Spring-damper toward the load-transfer target. Reduced motion tracks the target
 * with no overshoot. Velocity is radians per second.
 */
export function settlePitch(
	current: number,
	velocity: number,
	target: number,
	dt: number,
	reducedMotion: boolean,
): { pitch: number; velocity: number } {
	if (reducedMotion || dt <= 0) return { pitch: target, velocity: 0 };
	const accel = PITCH_STIFFNESS * (target - current) - PITCH_DAMPING * velocity;
	const nextVel = velocity + accel * dt;
	const nextPitch = current + nextVel * dt;
	if (
		Math.abs(target) < 1e-8 &&
		Math.abs(nextPitch) < 1e-5 &&
		Math.abs(nextVel) < 1e-5
	) {
		return { pitch: 0, velocity: 0 };
	}
	return { pitch: nextPitch, velocity: nextVel };
}
