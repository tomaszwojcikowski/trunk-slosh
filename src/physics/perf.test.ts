import { describe, expect, it } from "vitest";
import { Track } from "../world/Track";
import { FluidLayer } from "./FluidLayer";
import { VehicleSimulation } from "./VehicleSimulation";

describe("simulation perf budget", () => {
	it("runs 120 coupled steps within CI budget", () => {
		const track = new Track(9);
		const vehicle = new VehicleSimulation();
		const fluid = new FluidLayer();
		vehicle.reset(track);
		const t0 = performance.now();
		for (let i = 0; i < 120; i++) {
			vehicle.step(
				1 / 120,
				{ throttle: 0.6, steer: Math.sin(i / 10) * 0.5 },
				track,
				fluid,
			);
			fluid.step(1 / 120, vehicle.fluidFrame());
		}
		const ms = performance.now() - t0;
		// Rapier WASM + heightfield is heavier than the old Matter bicycle step.
		expect(ms).toBeLessThan(450);
	});

	it("keeps the budget on a boulder seed with a ramp and a wash", () => {
		const track = new Track(2, { archetype: "boulder" });
		expect(track.archetype).toBe("boulder");
		expect(track.furniture).not.toBeNull();
		const vehicle = new VehicleSimulation();
		const fluid = new FluidLayer();
		vehicle.reset(track);
		const t0 = performance.now();
		for (let i = 0; i < 120; i++) {
			vehicle.step(
				1 / 120,
				{ throttle: 0.8, steer: Math.sin(i / 8) * 0.4 },
				track,
				fluid,
			);
			fluid.step(1 / 120, vehicle.fluidFrame());
		}
		expect(performance.now() - t0).toBeLessThan(450);
	});
});
