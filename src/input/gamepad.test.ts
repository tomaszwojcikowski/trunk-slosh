import { describe, expect, it } from "vitest";
import { driveFromPad, padFromGamepad } from "./gamepad";
import { Input } from "./Input";

describe("gamepad", () => {
	it("matches saturated keys with a normalized pad snapshot", () => {
		const root = {
			querySelector: () => null,
		} as unknown as HTMLElement;
		const input = new Input(root);
		input.holdKey("KeyW", true);
		input.holdKey("KeyD", true);
		input.holdKey("Space", true);
		let keys = input.poll(0);
		for (let i = 0; i < 90; i++) keys = input.poll(1 / 60);
		input.holdKey("KeyW", false);
		input.holdKey("KeyD", false);
		input.holdKey("Space", false);
		input.setPad({ steer: 1, throttle: 1.4, brake: 0, handbrake: true });
		const pad = input.poll(0);
		expect(pad).toEqual(keys);
		expect(pad.throttle).toBe(1);
		expect(pad.steer).toBe(1);
		expect(pad.handbrake).toBe(true);
	});

	it("reads the right stick as a pedal when the triggers are idle", () => {
		const buttons = Array.from({ length: 8 }, () => ({
			pressed: false,
			value: 0,
		}));
		const pad = padFromGamepad({ axes: [-0.4, 0, 0, -0.7], buttons });
		expect(driveFromPad(pad)).toEqual({
			steer: -0.4,
			throttle: 0.7,
			handbrake: false,
		});
		buttons[7] = { pressed: true, value: 0.5 };
		buttons[0] = { pressed: true, value: 1 };
		const trig = padFromGamepad({ axes: [0.2, 0, 0, 0], buttons });
		expect(trig.throttle).toBeCloseTo(0.5, 5);
		expect(trig.handbrake).toBe(true);
	});
});
