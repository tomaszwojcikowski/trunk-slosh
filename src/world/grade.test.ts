import { describe, expect, it } from "vitest";
import { rotate } from "../math/vec2";
import { FluidLayer } from "../physics/FluidLayer";
import { VehicleSimulation } from "../physics/VehicleSimulation";
import { isoProject } from "../render/isoProject";
import {
	bankedHeight,
	featureHeight,
	hillScale,
	liquidBodyAccel,
	MAX_CANYON_GRADE,
	profileGrade,
	RAMP_HEIGHT,
	WASH_DEPTH,
} from "./grade";
import { Track } from "./Track";

function run(
	fluid: FluidLayer,
	accel: { x: number; y: number },
	seconds: number,
) {
	for (let t = 0; t < seconds; t += 1 / 120) {
		fluid.step(1 / 120, { accel, omega: 0, alpha: 0 });
	}
}

describe("road grades", () => {
	it("raises the inside of a bank and keeps a flat ribbon level", () => {
		const half = 3.2;
		expect(Math.abs(bankedHeight(0, 0, half))).toBeLessThan(0.01);
		expect(Math.abs(bankedHeight(0, 0, -half))).toBeLessThan(0.01);
		const bank = 0.04;
		const centerZ = 1.5;
		const inside = isoProject(0, half, bankedHeight(centerZ, bank, half));
		const outside = isoProject(0, -half, bankedHeight(centerZ, bank, -half));
		const flatInside = isoProject(0, half, centerZ);
		const flatOutside = isoProject(0, -half, centerZ);
		expect(flatInside.y - inside.y).toBeCloseTo(bank * half, 5);
		expect(outside.y - flatOutside.y).toBeCloseTo(bank * half, 5);
		expect(inside.y).toBeLessThan(flatInside.y);

		const track = new Track(7, { archetype: "canyon" });
		let best = 0;
		let s = 0;
		for (let u = 0; u < track.totalLength; u += 2) {
			const b = track.bankAt(u);
			if (Math.abs(b) > Math.abs(best)) {
				best = b;
				s = u;
			}
		}
		expect(Math.abs(best)).toBeGreaterThan(0.01);
		const frame = track.pointAt(s);
		const edge = track.roadWidth / 2 - 0.7;
		const sign = Math.sign(best);
		const lateral = edge * sign;
		const pin = {
			x: frame.p.x + frame.n.x * lateral,
			y: frame.p.y + frame.n.y * lateral,
		};
		const pout = {
			x: frame.p.x - frame.n.x * lateral,
			y: frame.p.y - frame.n.y * lateral,
		};
		const zc = track.heightAt(s);
		const projectedIn = isoProject(
			pin.x,
			pin.y,
			bankedHeight(zc, best, lateral),
		);
		const projectedOut = isoProject(
			pout.x,
			pout.y,
			bankedHeight(zc, best, -lateral),
		);
		const flatIn = isoProject(pin.x, pin.y, zc);
		const flatOut = isoProject(pout.x, pout.y, zc);
		expect(flatIn.y - projectedIn.y).toBeCloseTo(Math.abs(best) * edge, 4);
		expect(projectedOut.y - flatOut.y).toBeCloseTo(Math.abs(best) * edge, 4);
	});

	it("scales easy hills and leaves medium and hard on the current cap", () => {
		expect(hillScale("easy")).toBe(0.55);
		expect(hillScale("medium")).toBe(1);
		expect(hillScale("hard")).toBe(1);
		expect(profileGrade("canyon", 0, 1)).toBeCloseTo(MAX_CANYON_GRADE, 6);
		expect(profileGrade("canyon", 0, hillScale("easy"))).toBeCloseTo(
			MAX_CANYON_GRADE * 0.55,
			6,
		);
		expect(profileGrade("canyon", 0, hillScale("hard"))).toBeLessThanOrEqual(
			MAX_CANYON_GRADE + 1e-9,
		);
		const furniture = { rampS: 100, washS: 200 };
		expect(featureHeight(100, furniture, 0.55)).toBeCloseTo(
			RAMP_HEIGHT * 0.55,
			5,
		);
		expect(featureHeight(200, furniture, 0.55)).toBeCloseTo(-WASH_DEPTH, 5);
		for (const difficulty of ["easy", "hard"] as const) {
			const track = new Track(3, { archetype: "flats", difficulty });
			for (let s = 0; s <= track.totalLength; s += 8)
				expect(Math.abs(track.heightAt(s))).toBeLessThan(0.01);
		}
	});

	it("keeps flats within a centimeter of z = 0", () => {
		const track = new Track(3, { archetype: "flats" });
		expect(track.furniture).toBeNull();
		for (let s = 0; s <= track.totalLength; s += 4) {
			expect(Math.abs(track.heightAt(s))).toBeLessThan(0.01);
			expect(Math.abs(track.gradeAt(s))).toBeLessThan(1e-8);
		}
	});

	it("gives a canyon a non-zero grade and a boulder a step", () => {
		const canyon = new Track(4, { archetype: "canyon" });
		let peak = 0;
		for (let s = 0; s < canyon.totalLength; s += 1)
			peak = Math.max(peak, Math.abs(canyon.gradeAt(s)));
		expect(peak).toBeGreaterThan(0.05);
		const boulder = new Track(2, { archetype: "boulder" });
		expect(boulder.heightAt(80)).toBeGreaterThan(boulder.heightAt(1));
		expect(boulder.furniture).not.toBeNull();
		const ramp = boulder.furniture?.rampS ?? 0;
		expect(boulder.heightAt(ramp)).toBeGreaterThan(RAMP_HEIGHT * 0.5);
		const wash = boulder.furniture?.washS ?? 0;
		expect(boulder.inWash(wash)).toBe(true);
		expect(boulder.inWash(wash + 40)).toBe(false);
	});

	it("shifts a resting centroid downhill and still conserves volume", () => {
		const track = new Track(1, { archetype: "canyon" });
		let s = track.startS;
		let best = 0;
		for (let u = track.startS; u < track.finishS; u += 2) {
			if (track.inWash(u)) continue;
			const g = track.gradeAt(u);
			if (Math.abs(u - (track.furniture?.rampS ?? -1e9)) < 20) continue;
			if (g > best) {
				best = g;
				s = u;
			}
		}
		expect(best).toBeGreaterThan(0.04);
		const world = track.liquidAccelAt(s);
		const angle = track.pointAt(s).angle;
		const local = rotate(world, -angle);
		const fluid = new FluidLayer();
		const v0 = fluid.volume();
		const c0 = fluid.centroidLocal();
		run(fluid, { x: -local.x, y: -local.y }, 0.8);
		const c1 = fluid.centroidLocal();
		const downhill = (c1.x - c0.x) * local.x + (c1.y - c0.y) * local.y;
		expect(downhill).toBeGreaterThan(0);
		expect(fluid.spilledVolume).toBe(0);
		expect(fluid.volume()).toBeCloseTo(v0, 5);
	});

	it("banks liquid toward the outside of a left turn", () => {
		const world = liquidBodyAccel(0, 0.06, { x: 1, y: 0 }, { x: 0, y: 1 });
		expect(world.y).toBeLessThan(0);
		const fluid = new FluidLayer();
		const y0 = fluid.centroidLocal().y;
		run(fluid, { x: -world.x, y: -world.y }, 1.6);
		expect(fluid.centroidLocal().y).toBeLessThan(y0);
	});

	it("pulls a parked canyon truck downhill without a Matter gravity term", () => {
		const track = new Track(1, { archetype: "canyon" });
		const vehicle = new VehicleSimulation();
		const fluid = new FluidLayer();
		vehicle.reset(track);
		const along = track.query(track.start).along;
		const grade = track.gradeAt(along);
		expect(Math.abs(grade)).toBeGreaterThan(0.02);
		const tangent = track.pointAt(along);
		const downhill = {
			x: -Math.sign(grade) * Math.cos(tangent.angle),
			y: -Math.sign(grade) * Math.sin(tangent.angle),
		};
		for (let i = 0; i < 180; i++) {
			vehicle.step(1 / 120, { throttle: 0, steer: 0 }, track, fluid);
			fluid.step(1 / 120, vehicle.fluidFrame());
		}
		const vel = vehicle.snapshot().vel;
		expect(vel.x * downhill.x + vel.y * downhill.y).toBeGreaterThan(0.02);
	});
});
