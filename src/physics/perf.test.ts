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
		expect(ms).toBeLessThan(250);
	});
});
