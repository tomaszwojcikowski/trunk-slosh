import { CAR_SPEC } from "./VehicleSimulation";

export type VehiclePreset = "pickup" | "short";

export function applyVehiclePreset(preset: VehiclePreset) {
	if (preset === "pickup") {
		Object.assign(CAR_SPEC, {
			a: 1.3,
			b: 1.35,
			inertia: 2300,
			maxSteer: 0.58,
			steerRate: 2.8,
		});
		return;
	}
	Object.assign(CAR_SPEC, {
		a: 1.05,
		b: 1.05,
		inertia: 1800,
		maxSteer: 0.68,
		steerRate: 3.4,
	});
}
