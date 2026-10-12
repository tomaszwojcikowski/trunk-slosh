import { describe, expect, it } from "vitest";
import { isoProject } from "./isoProject";
import { convexHull, frustumSideFaces } from "./isoSolids";

const square = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 1, y: 1 },
	{ x: 0, y: 1 },
];

describe("frustumSideFaces", () => {
	it("shows only the two faces turned toward the iso viewer", () => {
		for (const base of [square, [...square].reverse()]) {
			const { faces } = frustumSideFaces(base, base, 0, 1, isoProject);
			const normals = faces
				.map((f) => `${Math.round(f.normal.x)},${Math.round(f.normal.y)}`)
				.sort();
			expect(normals).toEqual(["0,1", "1,0"]);
		}
	});

	it("sorts visible faces back to front", () => {
		const { faces } = frustumSideFaces(square, square, 0, 1, isoProject);
		for (let i = 1; i < faces.length; i++)
			expect(faces[i].depth).toBeGreaterThanOrEqual(faces[i - 1].depth);
	});
});

describe("convexHull", () => {
	it("drops interior points", () => {
		const hull = convexHull([...square, { x: 0.5, y: 0.5 }]);
		expect(hull).toHaveLength(4);
	});
});
