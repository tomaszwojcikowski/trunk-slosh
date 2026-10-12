import type { DriveInput } from "../physics/VehicleSimulation";

export type PadAxes = {
	steer: number;
	/** Right trigger, already scaled toward 0–1 by the caller. */
	throttle: number;
	brake: number;
	handbrake: boolean;
};

const clamp = (x: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, x));

/** Triggers and sticks become a pedal in 0–1 before any keyboard-style ramp. */
export function normalizeAxis01(raw: number): number {
	if (!Number.isFinite(raw)) return 0;
	return clamp(raw, 0, 1);
}

export function driveFromPad(pad: PadAxes): DriveInput {
	const throttle = normalizeAxis01(pad.throttle);
	const brake = normalizeAxis01(pad.brake);
	return {
		steer: clamp(pad.steer, -1, 1),
		throttle: clamp(throttle - brake, -1, 1),
		handbrake: pad.handbrake,
	};
}

export type PadButton = { pressed: boolean; value: number };

export function padFromGamepad(gp: {
	axes: readonly number[];
	buttons: readonly PadButton[];
}): PadAxes {
	const axis = (i: number) => gp.axes[i] ?? 0;
	const button = (i: number) => gp.buttons[i];
	const trigger = (i: number) => {
		const b = button(i);
		if (!b) return 0;
		const raw = Number.isFinite(b.value) ? b.value : b.pressed ? 1 : 0;
		return normalizeAxis01(raw);
	};
	let throttle = trigger(7);
	let brake = trigger(6);
	const stickY = axis(3);
	if (throttle < 0.05 && brake < 0.05) {
		if (stickY < -0.08) throttle = normalizeAxis01(-stickY);
		else if (stickY > 0.08) brake = normalizeAxis01(stickY);
	}
	return {
		steer: clamp(axis(0), -1, 1),
		throttle,
		brake,
		handbrake: !!(button(0)?.pressed || button(1)?.pressed),
	};
}

export function padActive(pad: PadAxes): boolean {
	return (
		Math.abs(pad.steer) > 0.02 ||
		pad.throttle > 0.02 ||
		pad.brake > 0.02 ||
		pad.handbrake
	);
}
