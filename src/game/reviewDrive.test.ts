import { describe, expect, it } from "vitest";
import { FluidLayer } from "../physics/FluidLayer";
import { ParticlePool } from "../physics/Particles";
import { VehicleSimulation } from "../physics/VehicleSimulation";
import { Track } from "../world/Track";
import { reviewJuiceInput } from "./reviewDrive";

describe("review juice", () => {
	it("spills a droplet and kicks up dust", () => {
		const track = new Track(8, { archetype: "flats" });
		const vehicle = new VehicleSimulation();
		const fluid = new FluidLayer();
		const particles = new ParticlePool();
		vehicle.reset(track);
		const dt = 1 / 120;
		let elapsed = 0;
		for (let i = 0; i < 3.6 * 120; i++) {
			vehicle.step(dt, reviewJuiceInput(elapsed), track, fluid);
			const spills = fluid.step(dt, vehicle.fluidFrame());
			if (spills.length) {
				particles.emit(
					spills.map((s) => ({
						x: s.local.x,
						y: s.local.y,
						z: 1.2,
						vx: s.relVel.x,
						vy: s.relVel.y,
						vz: 0.4,
						volume: s.volume,
						groundZ: 0,
					})),
				);
			}
			const snap = vehicle.snapshot();
			// Match Game.ts dust gate: sand at speed, or a hard skid.
			const dusty = snap.wheels.some(
				(w) => (w.sand && snap.speed > 3) || w.skid > 0.35,
			);
			if (dusty && i % 4 === 0)
				particles.addPuff(snap.pos.x, snap.pos.y, 0, 0, 0.4, snap.z);
			elapsed += dt;
		}
		expect(particles.droplets.length + particles.splats.length).toBeGreaterThan(
			0,
		);
		expect(particles.puffs.length).toBeGreaterThan(0);
	});
});
