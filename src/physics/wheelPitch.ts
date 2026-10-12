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
