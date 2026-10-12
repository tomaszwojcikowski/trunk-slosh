import { describe, expect, it } from "vitest";
import type { ReplayRecording } from "../game/replay";
import { Track } from "../world/Track";
import { FluidLayer } from "./FluidLayer";
import { VehicleSimulation } from "./VehicleSimulation";

const FIXTURE: ReplayRecording = {
	version: 2,
	config: {
		seed: 42,
		mode: "practice",
		difficulty: "medium",
		cargo: "water",
		vehicle: "pickup",
		archetype: "auto",
	},
	frames: Array.from({ length: 240 }, (_, i) => ({
		dt: 1 / 120,
		input: { throttle: i < 120 ? 0.4 : -0.3, steer: Math.sin(i / 20) * 0.3 },
	})),
};

function letter(kept: number): string {
	if (kept >= 0.97) return "S";
	if (kept >= 0.9) return "A";
	if (kept >= 0.75) return "B";
	if (kept >= 0.5) return "C";
	return "D";
}

function play(): number {
	const track = new Track(FIXTURE.config.seed, {
		difficulty: FIXTURE.config.difficulty,
	});
	const vehicle = new VehicleSimulation();
	const fluid = new FluidLayer();
	fluid.setCargoPreset(FIXTURE.config.cargo);
	vehicle.reset(track);
	for (const f of FIXTURE.frames) {
		vehicle.step(f.dt, f.input, track, fluid);
		fluid.step(f.dt, vehicle.fluidFrame());
	}
	return fluid.remainingRatio();
}

describe("replay golden", () => {
	it("reproduces finish cargo within 1%", () => {
		const a = play();
		const b = play();
		expect(Number.isFinite(a)).toBe(true);
		expect(a).toBeGreaterThan(0);
		expect(a).toBeLessThanOrEqual(1);
		expect(Math.abs(a - b)).toBeLessThanOrEqual(0.01);
		expect(letter(a)).toBe(letter(b));
	});
});
