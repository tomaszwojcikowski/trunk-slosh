import { describe, expect, it } from "vitest";
import {
	advanceWheelAngle,
	pitchedHeight,
	pitchFromLongAccel,
	settlePitch,
	WHEEL_RADIUS,
} from "./wheelPitch";

describe("wheel mark and pitch", () => {
	it("advances the wheel with distance and holds it at zero speed", () => {
		const rolled = advanceWheelAngle(0.4, 10, 0.5);
		expect(rolled).toBeCloseTo(0.4 + (10 * 0.5) / WHEEL_RADIUS, 6);
		expect(advanceWheelAngle(rolled, 0, 1)).toBe(rolled);
		const steered = advanceWheelAngle(0, 8, 0.25);
		expect(steered).toBeCloseTo((8 * 0.25) / WHEEL_RADIUS, 6);
	});

	it("stays level at rest and drops the nose under braking", () => {
		expect(pitchFromLongAccel(0)).toBe(0);
		const pitch = pitchFromLongAccel(-6);
		expect(pitch).toBeGreaterThan(0);
		const nose = pitchedHeight(1, 2, pitch);
		const tail = pitchedHeight(1, -2, pitch);
		expect(nose).toBeLessThan(1);
		expect(tail).toBeGreaterThan(nose);
	});

	it("settles toward a pitch target with at most one overshoot", () => {
		const target = pitchFromLongAccel(-6);
		let pitch = 0;
		let velocity = 0;
		let crossed = 0;
		let wasBelow = true;
		const dt = 1 / 120;
		for (let i = 0; i < 120; i++) {
			const next = settlePitch(pitch, velocity, target, dt, false);
			if (wasBelow && next.pitch > target) crossed++;
			if (!wasBelow && next.pitch < target) crossed++;
			wasBelow = next.pitch <= target;
			pitch = next.pitch;
			velocity = next.velocity;
		}
		expect(crossed).toBeLessThanOrEqual(1);
		expect(pitch).toBeCloseTo(target, 2);
		expect(settlePitch(0.2, 0.1, 0, dt, true)).toEqual({
			pitch: 0,
			velocity: 0,
		});
	});
});
