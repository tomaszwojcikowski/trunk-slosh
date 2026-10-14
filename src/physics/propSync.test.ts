import { describe, expect, it } from "vitest";
import { Track } from "../world/Track";
import { FluidLayer } from "./FluidLayer";
import { VehicleSimulation } from "./VehicleSimulation";

describe("dynamic prop sync", () => {
	it("copies Rapier barrel translation onto track.obstacles", () => {
		const track = new Track(7, { archetype: "flats" });
		const barrelIndex = track.obstacles.findIndex(
			(o) => o.dynamic && o.kind === "barrel",
		);
		expect(barrelIndex).toBeGreaterThanOrEqual(0);
		const before = {
			x: track.obstacles[barrelIndex].x,
			y: track.obstacles[barrelIndex].y,
		};

		const vehicle = new VehicleSimulation();
		const fluid = new FluidLayer();
		vehicle.reset(track);

		const props = (
			vehicle as unknown as {
				dynamicProps: {
					index: number;
					body: {
						applyImpulse: (
							impulse: { x: number; y: number; z: number },
							wake: boolean,
						) => void;
					};
				}[];
			}
		).dynamicProps;
		const prop = props.find((p) => p.index === barrelIndex);
		expect(prop).toBeTruthy();
		prop!.body.applyImpulse({ x: 55, y: 12, z: 28 }, true);

		for (let i = 0; i < 90; i++) {
			vehicle.step(1 / 120, { throttle: 0, steer: 0 }, track, fluid);
			fluid.step(1 / 120, vehicle.fluidFrame());
		}
		vehicle.syncProps(track);

		const after = track.obstacles[barrelIndex];
		expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(
			0.35,
		);
		expect(after.z).toBeGreaterThanOrEqual(0);
	});
});
