import { describe, expect, it } from "vitest";
import { earnedFromFinish } from "./achievements";

const base = {
	grade: "B",
	spilled: 0.01,
	difficulty: "medium",
	archetype: "flats",
	mode: "practice" as const,
	daily: false,
};

describe("achievements", () => {
	it("grants each finish once", () => {
		const first = earnedFromFinish([], {
			...base,
			grade: "S",
			spilled: 0,
			difficulty: "hard",
			mode: "contract",
			daily: true,
		});
		expect(first).toEqual([
			"first-s",
			"zero-spill",
			"hard-win",
			"contract-clear",
			"daily-clear",
		]);
		const again = earnedFromFinish(first, {
			...base,
			grade: "S",
			spilled: 0,
			difficulty: "hard",
		});
		expect(again).toEqual([]);
	});

	it("counts a boulder route as a hard win", () => {
		expect(earnedFromFinish([], { ...base, archetype: "boulder" })).toEqual([
			"hard-win",
		]);
	});
});
