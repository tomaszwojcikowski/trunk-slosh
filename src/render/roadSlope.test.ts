import { describe, expect, it } from "vitest";
import {
	asphaltForLit,
	bankHighlight,
	faceLit,
	gradeTint,
	needsGradeCrease,
	roadSurfaceNormal,
} from "./roadSlope";

describe("road slope visuals", () => {
	it("tilts the surface normal with grade and bank", () => {
		const flat = roadSurfaceNormal(0, 0, { x: 1, y: 0 }, { x: 0, y: 1 });
		expect(flat.z).toBeCloseTo(1, 5);
		expect(Math.abs(flat.x)).toBeLessThan(1e-9);
		expect(Math.abs(flat.y)).toBeLessThan(1e-9);

		const climb = roadSurfaceNormal(0.2, 0, { x: 1, y: 0 }, { x: 0, y: 1 });
		expect(climb.z).toBeLessThan(flat.z);
		expect(climb.x).not.toBeCloseTo(0, 5);

		const banked = roadSurfaceNormal(0, 0.05, { x: 1, y: 0 }, { x: 0, y: 1 });
		expect(banked.y).not.toBeCloseTo(0, 5);
		expect(banked.z).toBeGreaterThan(0.9);
	});

	it("shades asphalt darker when the face turns from the sun", () => {
		const lit = asphaltForLit(0.7);
		const shade = asphaltForLit(-0.1);
		expect(lit).not.toBe(shade);
		expect(faceLit({ x: 0, y: 0, z: 1 })).toBeGreaterThan(0.4);
	});

	it("flags creases on moderate grades and ramp crowns", () => {
		expect(needsGradeCrease(0.01, 0)).toBe(false);
		expect(needsGradeCrease(0.04, 0)).toBe(true);
		expect(needsGradeCrease(0, 0.6)).toBe(true);
		expect(gradeTint(0.01)).toBe(0);
		expect(gradeTint(0.1)).toBe(1);
		expect(bankHighlight(0.01)).toBe(0);
		expect(bankHighlight(0.06)).toBe(1);
	});
});
