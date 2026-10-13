import { describe, expect, it } from "vitest";
import { modeBlurb } from "./modeBlurb";

describe("mode blurb", () => {
	it("gives distinct non-empty stakes for each mode", () => {
		const practice = modeBlurb("practice");
		const contract = modeBlurb("contract");
		const trial = modeBlurb("timetrial");
		expect(practice.length).toBeGreaterThan(10);
		expect(contract.length).toBeGreaterThan(10);
		expect(trial.length).toBeGreaterThan(10);
		expect(new Set([practice, contract, trial]).size).toBe(3);
		expect(contract.toLowerCase()).toMatch(/cargo|ends|contract/);
		expect(trial.toLowerCase()).toMatch(/time|85|clock/);
		expect(practice.toLowerCase()).toMatch(/practice|no fail|learn/);
		for (const line of [practice, contract, trial])
			expect(line.length).toBeLessThanOrEqual(90);
	});
});
