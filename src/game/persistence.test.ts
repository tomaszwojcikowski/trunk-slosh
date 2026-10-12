import { describe, expect, it } from "vitest";
import { isBetterRun } from "./persistence";

describe("isBetterRun", () => {
	it("ranks time trial by a faster finish", () => {
		const prev = { kept: 0.9, time: 80 };
		expect(isBetterRun("timetrial", prev, { kept: 0.99, time: 90 })).toBe(
			false,
		);
		expect(isBetterRun("timetrial", prev, { kept: 0.86, time: 70 })).toBe(true);
	});

	it("ranks practice and contract by cargo, then time", () => {
		const prev = { kept: 0.8, time: 70 };
		expect(isBetterRun("practice", prev, { kept: 0.9, time: 90 })).toBe(true);
		expect(isBetterRun("contract", prev, { kept: 0.7, time: 40 })).toBe(false);
		expect(
			isBetterRun("practice", { kept: 0.9, time: 80 }, { kept: 0.9, time: 70 }),
		).toBe(true);
	});
});
