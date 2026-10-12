import { describe, expect, it } from "vitest";
import { isoDepth, isoProject } from "./isoProject";

describe("isoProject", () => {
	it("separates axes on the ground plane", () => {
		const a = isoProject(1, 0, 0);
		const b = isoProject(0, 1, 0);
		expect(a.x).toBeCloseTo(Math.sqrt(3) / 2, 5);
		expect(b.x).toBeCloseTo(-Math.sqrt(3) / 2, 5);
		expect(a.y).toBeCloseTo(0.5, 5);
		expect(b.y).toBeCloseTo(0.5, 5);
	});

	it("lifts screen y when z increases", () => {
		const low = isoProject(0, 0, 0);
		const high = isoProject(0, 0, 0.4);
		expect(high.y).toBeLessThan(low.y);
	});

	it("orders depth for painter sorting", () => {
		expect(isoDepth(0, 0, 0)).toBeLessThan(isoDepth(1, 1, 0));
		expect(isoDepth(1, 1, 0)).toBeGreaterThan(isoDepth(1, 1, 0.5));
	});
});
