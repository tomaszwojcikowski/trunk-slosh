import { describe, expect, it } from "vitest";
import { ghostSplitLabel, ghostSplitSeconds } from "./ghostSplit";

describe("ghost split", () => {
	it("signs ahead negative and behind positive", () => {
		expect(ghostSplitSeconds(10, 10.4)).toBeCloseTo(-0.4, 6);
		expect(ghostSplitSeconds(12.2, 11)).toBeCloseTo(1.2, 6);
		expect(ghostSplitLabel(10, 10.4, true)).toBe("−0.4s");
		expect(ghostSplitLabel(12.2, 11, true)).toBe("+1.2s");
		expect(ghostSplitLabel(5, 5, true)).toBe("0.0s");
		expect(ghostSplitLabel(5, 5.02, true)).toBe("0.0s");
		expect(ghostSplitLabel(1, 2, false)).toBeNull();
	});
});
