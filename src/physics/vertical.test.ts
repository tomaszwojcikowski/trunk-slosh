import { describe, expect, it } from "vitest";
import { cosineBump, RAMP_HALF, RAMP_HEIGHT } from "../world/grade";
import { stepVertical, type VerticalState } from "./vertical";

describe("ramps", () => {
	it("leaves the ground on a short ramp and records airborne time", () => {
		let state: VerticalState = {
			z: 0,
			vz: 0,
			airborne: false,
			airborneTime: 0,
		};
		let airborne = 0;
		let launched = false;
		const speed = 22;
		const center = 30;
		let s = 0;
		const dt = 1 / 120;
		for (let i = 0; i < 500; i++) {
			const ground = RAMP_HEIGHT * cosineBump(s, center, RAMP_HALF);
			const ahead = RAMP_HEIGHT * cosineBump(s + speed * dt, center, RAMP_HALF);
			const stepped = stepVertical(state, dt, ground, ahead, speed);
			state = stepped.state;
			if (state.airborne) {
				launched = true;
				airborne += dt;
			}
			s += speed * dt;
		}
		expect(launched).toBe(true);
		expect(airborne).toBeGreaterThan(0.05);
		expect(airborne).toBeLessThan(1.5);
		expect(state.airborne).toBe(false);
	});
});
