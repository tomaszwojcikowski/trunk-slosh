import { describe, expect, it } from "vitest";
import { engineGainFor } from "./AudioBus";
import { airborneMix } from "./airborneMix";

describe("airborne mix", () => {
	it("passes grounded values through", () => {
		const mix = airborneMix(10, 0.6, 0.04, false);
		expect(mix.engineGain).toBeCloseTo(engineGainFor(10, 0.6));
		expect(mix.roll).toBe(0.04);
		expect(mix.throttle).toBe(0.6);
	});

	it("drops roll and throttle in the air and keeps a speed residual", () => {
		const mix = airborneMix(10, 0.8, 0.05, true);
		expect(mix.roll).toBe(0);
		expect(mix.throttle).toBe(0);
		expect(mix.engineGain).toBeCloseTo(engineGainFor(10, 0));
		expect(mix.engineGain).not.toBeCloseTo(engineGainFor(10, 0.8));
	});

	it("keeps a parked truck silent on the ground", () => {
		expect(airborneMix(0, 0, 0, false).engineGain).toBe(0);
	});
});
