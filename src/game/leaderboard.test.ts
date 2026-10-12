import { describe, expect, it } from "vitest";
import { DISCUSSIONS_URL, scoreBlurb } from "./leaderboard";
import type { RunConfig } from "./runConfig";

const cfg: RunConfig = {
	seed: 42,
	daily: true,
	mode: "practice",
	difficulty: "medium",
	archetype: "auto",
	cargo: "water",
	vehicle: "pickup",
	useFluidWorker: false,
	customGoo: false,
};

describe("leaderboard stub", () => {
	it("writes a score the player can paste, with no secret", () => {
		const text = scoreBlurb(
			cfg,
			"A",
			0.91,
			"1:02.0",
			"https://example.test/?daily=1",
		);
		expect(text).toContain("A");
		expect(text).toContain("daily");
		expect(text).toContain("https://example.test/?daily=1");
		expect(DISCUSSIONS_URL.startsWith("https://github.com/")).toBe(true);
		expect(text.includes("token")).toBe(false);
	});
});
