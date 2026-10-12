import { describe, expect, it } from "vitest";
import { captureGrain, grainMultiplier } from "./InkPost";

describe("ink grain", () => {
	it("freezes grain for a review capture and a paused demo", () => {
		expect(captureGrain(true, false)).toBe(0);
		expect(captureGrain(false, true)).toBe(0);
		expect(captureGrain(false, false)).toBe(1);
	});

	it("keeps a frozen frame independent of the grain hash", () => {
		expect(grainMultiplier(0, 0)).toBeCloseTo(grainMultiplier(0, 1), 5);
		expect(grainMultiplier(1, 0)).not.toBeCloseTo(grainMultiplier(1, 1), 3);
	});
});
