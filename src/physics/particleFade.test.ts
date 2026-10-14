import { describe, expect, it } from "vitest";
import { SKID_LIFE, SPLAT_LIFE } from "./Particles";
import {
	popupAlpha,
	popupRise,
	puffAlpha,
	puffScale,
	skidAlpha,
	splatAlpha,
} from "./particleFade";

describe("particle fade curves", () => {
	it("zeros alpha and scale at life 0 and is full at birth", () => {
		expect(puffAlpha(0, 1)).toBe(0);
		expect(puffScale(0, 1)).toBe(0.55);
		expect(puffAlpha(1, 1)).toBe(1);
		expect(puffScale(1, 1)).toBe(1);

		expect(splatAlpha(0, SPLAT_LIFE)).toBe(0);
		expect(splatAlpha(SPLAT_LIFE, SPLAT_LIFE)).toBe(1);
		expect(splatAlpha(SPLAT_LIFE / 2, SPLAT_LIFE)).toBe(1);

		expect(skidAlpha(0, SKID_LIFE, 1)).toBe(0);
		expect(skidAlpha(SKID_LIFE, SKID_LIFE, 0.8)).toBeCloseTo(0.8, 6);
		expect(skidAlpha(SKID_LIFE / 2, SKID_LIFE, 1)).toBe(1);

		expect(popupAlpha(0, 1)).toBe(0);
		expect(popupAlpha(1, 1)).toBe(1);
		expect(popupRise(1, 1, 46)).toBe(0);
		expect(popupRise(0, 1, 46)).toBe(46);
		expect(popupRise(0.5, 1, 46)).toBeCloseTo(23, 5);
	});
});
