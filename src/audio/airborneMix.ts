import { engineGainFor } from "./AudioBus";

/** Grounded values pass through. In the air, rumble stops and throttle drops out of the engine gain. */
export function airborneMix(
	speed: number,
	throttle: number,
	roll: number,
	airborne: boolean,
): { engineGain: number; roll: number; throttle: number } {
	if (!airborne)
		return { engineGain: engineGainFor(speed, throttle), roll, throttle };
	return { engineGain: engineGainFor(speed, 0), roll: 0, throttle: 0 };
}
