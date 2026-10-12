import type { DriveInput } from "../physics/VehicleSimulation";

export type InputAction =
	| "restart"
	| "newTrack"
	| "toggleInk"
	| "toggleDebug"
	| "toggleTrunkIso"
	| "pause"
	| "toggleSettings";

/** Keyboard pedals ramp like a real foot so a held key doesn't slam the tub with a step input. */
const THROTTLE_RAMP = 1.6;
const BRAKE_RAMP = 3;
const RELEASE_RAMP = 6;

export class Input {
	keyboardRampMul = 1;
	touchSensitivityMul = 1;
	private keys = new Set<string>();
	private keyThrottle = 0;
	private touchSteer = 0;
	private touchThrottle = 0;
	private touchHandbrake = false;
	private listeners: ((a: InputAction) => void)[] = [];

	constructor(root: HTMLElement) {
		window.addEventListener("keydown", (e) => {
			if (
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
					e.code,
				)
			)
				e.preventDefault();
			if (e.repeat) return;
			this.keys.add(e.code);
			const action: InputAction | null =
				e.code === "KeyR"
					? "restart"
					: e.code === "KeyN"
						? "newTrack"
						: e.code === "KeyH"
							? "toggleInk"
							: e.code === "Backquote"
								? "toggleDebug"
								: e.code === "KeyI"
									? "toggleTrunkIso"
									: e.code === "KeyP"
										? "pause"
										: e.code === "Comma"
											? "toggleSettings"
											: null;
			if (action) {
				for (const l of this.listeners) l(action);
			}
		});
		window.addEventListener("keyup", (e) => this.keys.delete(e.code));
		window.addEventListener("blur", () => this.keys.clear());
		this.setupTouch(root);
	}

	onAction(listener: (a: InputAction) => void) {
		this.listeners.push(listener);
	}

	/** True once the player touches any drive control */
	get engaged(): boolean {
		return (
			Math.abs(this.keyThrottle) > 0.01 || Math.abs(this.touchThrottle) > 0.05
		);
	}

	private setupTouch(root: HTMLElement) {
		const bind = (el: HTMLElement, axis: "steer" | "throttle") => {
			const knob = el.querySelector<HTMLElement>(".knob");
			const update = (clientX: number, clientY: number) => {
				const rect = el.getBoundingClientRect();
				const r = rect.width * 0.38;
				const dx = clientX - (rect.left + rect.width / 2);
				const dy = clientY - (rect.top + rect.height / 2);
				const ax = Math.max(-1, Math.min(1, dx / r));
				const ay = Math.max(-1, Math.min(1, dy / r));
				if (axis === "steer") {
					this.touchSteer = ax;
					if (knob) knob.style.transform = `translate(${ax * r}px, 0)`;
				} else {
					this.touchThrottle = -ay;
					if (knob) knob.style.transform = `translate(0, ${ay * r}px)`;
				}
			};
			const reset = () => {
				if (knob) knob.style.transform = "translate(0, 0)";
				if (axis === "steer") this.touchSteer = 0;
				else this.touchThrottle = 0;
			};
			el.addEventListener("pointerdown", (e) => {
				el.setPointerCapture(e.pointerId);
				update(e.clientX, e.clientY);
			});
			el.addEventListener("pointermove", (e) => {
				if (el.hasPointerCapture(e.pointerId)) update(e.clientX, e.clientY);
			});
			el.addEventListener("pointerup", reset);
			el.addEventListener("pointercancel", reset);
		};

		const steer = root.querySelector<HTMLElement>('[data-pad="steer"]');
		const drive = root.querySelector<HTMLElement>('[data-pad="drive"]');
		if (steer) bind(steer, "steer");
		if (drive) bind(drive, "throttle");

		const brake = root.querySelector<HTMLElement>('[data-pad="handbrake"]');
		if (brake) {
			brake.addEventListener("pointerdown", (e) => {
				brake.setPointerCapture(e.pointerId);
				this.touchHandbrake = true;
			});
			const off = () => (this.touchHandbrake = false);
			brake.addEventListener("pointerup", off);
			brake.addEventListener("pointercancel", off);
		}
	}

	poll(dt: number): DriveInput {
		const up = this.keys.has("KeyW") || this.keys.has("ArrowUp");
		const down = this.keys.has("KeyS") || this.keys.has("ArrowDown");
		const target = (up ? 1 : 0) - (down ? 1 : 0);
		if (target > this.keyThrottle) {
			const rate =
				(this.keyThrottle < 0 ? RELEASE_RAMP : THROTTLE_RAMP) *
				this.keyboardRampMul;
			this.keyThrottle = Math.min(target, this.keyThrottle + rate * dt);
		} else if (target < this.keyThrottle) {
			const rate =
				(this.keyThrottle > 0 ? RELEASE_RAMP : BRAKE_RAMP) *
				this.keyboardRampMul;
			this.keyThrottle = Math.max(target, this.keyThrottle - rate * dt);
		}

		let steer = 0;
		if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) steer -= 1;
		if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) steer += 1;

		let throttle = this.keyThrottle;
		if (Math.abs(this.touchSteer) > 0.05)
			steer = this.touchSteer * this.touchSensitivityMul;
		if (Math.abs(this.touchThrottle) > 0.05) throttle = this.touchThrottle;

		return {
			throttle: Math.max(-1, Math.min(1, throttle)),
			steer: Math.max(-1, Math.min(1, steer)),
			handbrake: this.keys.has("Space") || this.touchHandbrake,
		};
	}
}
