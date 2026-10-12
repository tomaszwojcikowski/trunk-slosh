import type { DriveInput } from "../physics/VehicleSimulation";

/**
 * Scripted hard launch, then a brake-and-yaw so a review frame can catch a droplet and dust.
 * Autopilot rarely spills; this input does.
 */
export function reviewJuiceInput(t: number): DriveInput {
	if (t < 1.6) return { throttle: 1, steer: 0.15 };
	if (t < 3.2) return { throttle: -1, steer: 1, handbrake: true };
	return { throttle: 0.15, steer: 0.2 };
}
