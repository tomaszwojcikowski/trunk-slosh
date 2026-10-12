import { describe, expect, it } from "vitest";
import { MAX_CANYON_GRADE } from "../world/grade";
import { airborneLabel, gradeLabel } from "./gradeRead";

describe("grade and airborne labels", () => {
	it("reads a shallow slope as level and a canyon grade as a percent", () => {
		expect(gradeLabel(0)).toBe("level");
		expect(gradeLabel(0.01)).toBe("level");
		expect(gradeLabel(MAX_CANYON_GRADE)).toBe("+8%");
		expect(gradeLabel(-0.05)).toBe("-5%");
	});

	it("names a jump and the ground", () => {
		expect(airborneLabel(false)).toBe("ground");
		expect(airborneLabel(true)).toBe("air");
	});
});
