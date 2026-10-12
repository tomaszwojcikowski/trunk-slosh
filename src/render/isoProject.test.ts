import { describe, expect, it } from "vitest";
import {
	isoCameraPixelOffset,
	isoDepth,
	isoGroundTransform,
	isoProject,
	isoWorldToScreen,
} from "./isoProject";

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

	it("centers the camera in the ground transform", () => {
		const camera = { x: 12, y: -7 };
		const m = isoGroundTransform(camera, 16, 800, 600);
		expect(m.a * camera.x + m.c * camera.y + m.e).toBeCloseTo(400, 5);
		expect(m.b * camera.x + m.d * camera.y + m.f).toBeCloseTo(300, 5);
	});

	it("matches point projection with the canvas matrix", () => {
		const camera = { x: -3, y: 8, roll: 0.12 };
		const scale = 21;
		const m = isoGroundTransform(camera, scale, 1024, 768);
		const point = { x: 4, y: 11, z: 0 };
		const screen = isoWorldToScreen(
			point.x,
			point.y,
			point.z,
			camera,
			scale,
			1024,
			768,
		);
		expect(screen.x).toBeCloseTo(m.a * point.x + m.c * point.y + m.e, 5);
		expect(screen.y).toBeCloseTo(m.b * point.x + m.d * point.y + m.f, 5);
	});

	it("projects camera hatch offsets in scene pixels", () => {
		const offset = isoCameraPixelOffset({ x: 3, y: 1 }, 10);
		expect(offset.x).toBeCloseTo(Math.sqrt(3) * 10, 5);
		expect(offset.y).toBeCloseTo(2 * 10, 5);
	});
});
