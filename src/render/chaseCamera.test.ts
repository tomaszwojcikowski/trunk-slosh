import { describe, expect, it } from "vitest";
import { demoDrive } from "../game/demoDrive";
import { FluidLayer } from "../physics/FluidLayer";
import { VehicleSimulation } from "../physics/VehicleSimulation";
import { Track } from "../world/Track";
import { decayPunch, decayShake } from "./cameraMotion";
import {
	chasePoint,
	easeChase,
	followChase,
	truckInLowerHalf,
	truckScreenY,
} from "./chaseCamera";

describe("isometric chase frame", () => {
	it("golden-samples a parked truck six projected meters below center", () => {
		const truck = { x: 12, y: -4 };
		const cam = chasePoint(truck, { x: 0, y: 0 });
		expect(truckScreenY(truck, cam)).toBeCloseTo(6, 5);
		expect(truckInLowerHalf(truck, cam)).toBe(true);
	});

	it("fails the lower-half check when the camera offset is zero toward the viewer", () => {
		const truck = { x: 0, y: 0 };
		const vel = { x: 18 / Math.SQRT2, y: 18 / Math.SQRT2 };
		expect(
			truckInLowerHalf(truck, chasePoint(truck, vel, { x: 0, y: 0 })),
		).toBe(false);
		expect(truckInLowerHalf(truck, chasePoint(truck, vel))).toBe(true);
	});

	it("keeps the truck in the lower half on every heading", () => {
		const truck = { x: 3, y: 5 };
		for (const speed of [0, 10, 18, 30]) {
			for (let k = 0; k < 8; k++) {
				const a = (k / 8) * Math.PI * 2;
				const vel = { x: Math.cos(a) * speed, y: Math.sin(a) * speed };
				expect(
					truckInLowerHalf(truck, chasePoint(truck, vel)),
					`${speed} ${k}`,
				).toBe(true);
			}
		}
	});

	it("holds the truck in the lower half over a 10s demo", () => {
		const track = new Track(12345);
		const vehicle = new VehicleSimulation();
		const fluid = new FluidLayer();
		vehicle.reset(track);
		let cam = chasePoint(track.start, { x: 0, y: 0 });
		const dt = 1 / 120;
		for (let i = 0; i < 10 * 120; i++) {
			const snap = vehicle.snapshot();
			vehicle.step(
				dt,
				demoDrive(track, snap.pos, snap.angle, snap.speed),
				track,
				fluid,
			);
			fluid.step(dt, vehicle.fluidFrame());
			const next = vehicle.snapshot();
			cam = followChase(cam, chasePoint(next.pos, next.vel), dt);
			expect(truckInLowerHalf(next.pos, cam)).toBe(true);
		}
	});
});

describe("reduced motion", () => {
	it("leaves shake and punch at zero and does not add a roll", () => {
		expect(decayShake(0.8, 1 / 60, true)).toBe(0);
		expect(decayPunch(0.6, 1 / 60, true, true)).toBe(0);
		expect(decayShake(0.8, 1 / 60, false)).toBeGreaterThan(0);
		expect(decayShake(0.8, 1 / 60, false)).toBeLessThan(0.8);
	});
});

describe("chase ease", () => {
	it("lands between cam and target on the first step, then settles", () => {
		const cam = { x: 0, y: 0 };
		const target = { x: 10, y: -4 };
		const dt = 1 / 60;
		const step = easeChase(cam, target, dt);
		expect(step.x).toBeGreaterThan(cam.x);
		expect(step.x).toBeLessThan(target.x);
		expect(step.y).toBeLessThan(cam.y);
		expect(step.y).toBeGreaterThan(target.y);
		let cur = cam;
		for (let i = 0; i < 240; i++) cur = followChase(cur, target, dt);
		expect(cur.x).toBeCloseTo(target.x, 2);
		expect(cur.y).toBeCloseTo(target.y, 2);
	});
});
