import { describe, expect, it } from "vitest";
import { lipAccentGain, sloshCutoffFor } from "./cargoVoice";

describe("cargo voice", () => {
	it("orders the slosh bed thick, water, then volatile", () => {
		expect(sloshCutoffFor("thick")).toBe(90);
		expect(sloshCutoffFor("water")).toBe(140);
		expect(sloshCutoffFor("volatile")).toBe(210);
		expect(sloshCutoffFor("thick")).toBeLessThan(sloshCutoffFor("water"));
		expect(sloshCutoffFor("water")).toBeLessThan(sloshCutoffFor("volatile"));
	});

	it("starts a lip accent only at the lip or on a spill", () => {
		expect(lipAccentGain("calm", false)).toBe(0);
		expect(lipAccentGain("moving", false)).toBe(0);
		expect(lipAccentGain("lip", false)).toBe(0.1);
		expect(lipAccentGain("calm", true)).toBe(0.1);
	});
});
