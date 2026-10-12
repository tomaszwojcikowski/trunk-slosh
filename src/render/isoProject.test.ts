import { describe, expect, it } from "vitest";
import {
	isoCameraPixelOffset,
	isoDepth,
	isoGroundTransform,
	isoInView,
	isoProject,
	isoWorldToScreen,
} from "./isoProject";

describe("isoProject", () => {
	it("puts the ground axes 30° off horizontal", () => {
		const a = isoProject(1, 0, 0);
		const b = isoProject(0, 1, 0);
		expect(a.x).toBeCloseTo(Math.sqrt(3) / 2, 5);
		expect(b.x).toBeCloseTo(-Math.sqrt(3) / 2, 5);
		expect(Math.atan2(a.y, a.x)).toBeCloseTo(Math.PI / 6, 5);
		expect(Math.atan2(b.y, -b.x)).toBeCloseTo(Math.PI / 6, 5);
	});

	it("foreshortens x, y and z equally", () => {
		const lens = [
			isoProject(1, 0, 0),
			isoProject(0, 1, 0),
			isoProject(0, 0, 1),
		].map((p) => Math.hypot(p.x, p.y));
		for (const l of lens) expect(l).toBeCloseTo(lens[0], 9);
	});

	it("lifts screen y when z increases", () => {
		const low = isoProject(0, 0, 0);
		const high = isoProject(0, 0, 0.4);
		expect(high.y).toBeLessThan(low.y);
		expect(high.x).toBe(low.x);
	});

	it("orders depth toward the viewer above +x +y", () => {
		expect(isoDepth(0, 0, 0)).toBeLessThan(isoDepth(1, 1, 0));
		expect(isoDepth(1, 1, 0.5)).toBeGreaterThan(isoDepth(1, 1, 0));
	});

	it("centers the camera in the ground transform", () => {
		const camera = { x: 12, y: -7 };
		const m = isoGroundTransform(camera, 16, 800, 600);
		expect(m.a * camera.x + m.c * camera.y + m.e).toBeCloseTo(400, 5);
		expect(m.b * camera.x + m.d * camera.y + m.f).toBeCloseTo(300, 5);
	});

	it("matches point projection with the canvas matrix", () => {
		const camera = { x: -3, y: 8 };
		const scale = 21;
		const m = isoGroundTransform(camera, scale, 1024, 768);
		const point = { x: 4, y: 11 };
		const screen = isoWorldToScreen(
			point.x,
			point.y,
			0,
			camera,
			scale,
			1024,
			768,
		);
		expect(screen.x).toBeCloseTo(m.a * point.x + m.c * point.y + m.e, 5);
		expect(screen.y).toBeCloseTo(m.b * point.x + m.d * point.y + m.f, 5);
	});

	it("keeps a tall prop whose base is just off the bottom", () => {
		const half = 10;
		const dx = 13;
		const dy = 13;
		expect(isoInView(dx, dy, 0.4, 0, half, half)).toBe(false);
		expect(isoInView(dx, dy, 0.4, 2.4, half, half)).toBe(true);
	});

	it("projects camera hatch offsets in scene pixels", () => {
		const offset = isoCameraPixelOffset({ x: 3, y: 1 }, 10);
		expect(offset.x).toBeCloseTo(Math.sqrt(3) * 10, 5);
		expect(offset.y).toBeCloseTo(2 * 10, 5);
	});
});
