import { describe, expect, it } from "vitest";
import { rotate } from "../math/vec2";
import { FluidLayer } from "../physics/FluidLayer";
import { VehicleSimulation } from "../physics/VehicleSimulation";
import { liquidBodyAccel, RAMP_HEIGHT } from "./grade";
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
