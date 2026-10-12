import { describe, expect, it } from "vitest";
import { exportGooJson, gooFromCargo, parseGoo } from "./goo";

describe("custom goo", () => {
	it("clamps out-of-range tuning and keeps the tub export", () => {
		const parsed = parseGoo({
			name: "Sludge",
			viscosityMul: 99,
			pseudoMul: 0,
			density: 10,
			fillDepth: 5,
			wallHeight: 0.01,
		});
		expect(parsed).toEqual({
			version: 1,
			name: "Sludge",
			viscosityMul: 3,
			pseudoMul: 0.4,
			density: 400,
			fillDepth: 0.35,
			wallHeight: 0.25,
		});
		const json = JSON.parse(exportGooJson(gooFromCargo("thick"))) as {
			trunk: { minX: number };
			active: { viscosityMul: number };
		};
		expect(json.trunk.minX).toBeLessThan(0);
		expect(json.active.viscosityMul).toBeGreaterThan(1);
	});

	it("reads an `active` block", () => {
		const parsed = parseGoo({ active: { name: "Tar", viscosityMul: 2 } });
		expect(parsed?.name).toBe("Tar");
		expect(parsed?.viscosityMul).toBe(2);
	});
});
