import { describe, expect, it } from "vitest";
import { FluidLayer } from "../physics/FluidLayer";
import { VehicleSimulation } from "../physics/VehicleSimulation";
import { applyVehiclePreset } from "../physics/vehiclePresets";
import { Track } from "../world/Track";
import { GhostRunner } from "./ghost";
import type { ReplayRecording } from "./replay";

describe("ghost replay", () => {
	it("stays within 2 m of the reference car on the same inputs", () => {
		applyVehiclePreset("pickup");
		const frames = Array.from({ length: 360 }, (_, i) => ({
			dt: 1 / 120,
			input: {
				throttle: i < 200 ? 0.7 : 0.2,
				steer: Math.sin(i / 25) * 0.45,
			},
		}));
		const recording: ReplayRecording = {
			version: 2,
			config: {
				seed: 42,
				mode: "practice",
				difficulty: "medium",
				cargo: "water",
				vehicle: "pickup",
				archetype: "auto",
			},
			frames,
		};
		const track = new Track(42, { difficulty: "medium" });
		const refVehicle = new VehicleSimulation();
		const refFluid = new FluidLayer();
		refVehicle.reset(track);
		refFluid.setCargoPreset("water");
		const ghost = new GhostRunner();
		ghost.load(recording);
		ghost.reset(track, "water", null);

		let max = 0;
		for (const frame of frames) {
			refVehicle.step(frame.dt, frame.input, track, refFluid);
			refFluid.step(frame.dt, refVehicle.fluidFrame());
			ghost.step();
			const g = ghost.snapshot();
			const p = refVehicle.snapshot().pos;
			expect(g).not.toBeNull();
			max = Math.max(max, Math.hypot(g!.pos.x - p.x, g!.pos.y - p.y));
		}
		expect(max).toBeLessThan(2);
		expect(ghost.elapsed).toBeCloseTo(frames.length / 120, 5);
	});
});
