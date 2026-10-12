import { describe, expect, it } from "vitest";
import { axleLayout, PICKUP_A, PICKUP_B } from "./axleLayout";

describe("axle layout", () => {
	it("keeps the pickup wheels on the current art", () => {
		const wheels = axleLayout(PICKUP_A, PICKUP_B);
		expect(wheels[0].x).toBeCloseTo(1.3, 2);
		expect(wheels[2].x).toBeCloseTo(-1.35, 2);
	});

	it("pulls the short wheelbase closer than the pickup", () => {
		const pickup = axleLayout(1.3, 1.35);
		const short = axleLayout(1.05, 1.05);
		const span = (wheels: { x: number }[]) =>
			Math.max(...wheels.map((w) => w.x)) - Math.min(...wheels.map((w) => w.x));
		expect(span(short)).toBeLessThan(span(pickup));
		expect(short[0].x).toBeCloseTo(1.05, 2);
		expect(short[2].x).toBeCloseTo(-1.05, 2);
	});
});
