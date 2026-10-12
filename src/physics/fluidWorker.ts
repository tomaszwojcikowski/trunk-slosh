/**
 * Optional fluid step worker (enable via settings or ?worker=1).
 * Runs the same FluidLayer integrator off the main thread.
 */

import type { CargoPreset } from "./cargoPresets";
import { type FluidFrame, FluidLayer, type FluidSpill } from "./FluidLayer";

type InitMsg = {
	type: "init";
	nx: number;
	ny: number;
	preset: CargoPreset;
};

type StepMsg = {
	type: "step";
	epoch: number;
	dt: number;
	frame: FluidFrame;
	h: Float32Array;
	u: Float32Array;
	v: Float32Array;
	spilledVolume: number;
};

let fluid: FluidLayer | null = null;

self.onmessage = (ev: MessageEvent<InitMsg | StepMsg>) => {
	const msg = ev.data;
	if (msg.type === "init") {
		fluid = new FluidLayer(msg.nx, msg.ny);
		fluid.setCargoPreset(msg.preset);
		fluid.adaptiveCost = true;
		self.postMessage({ type: "ready" });
		return;
	}
	if (msg.type === "step" && fluid) {
		fluid.h.set(msg.h);
		fluid.u.set(msg.u);
		fluid.v.set(msg.v);
		fluid.spilledVolume = msg.spilledVolume;
		const spills: FluidSpill[] = fluid.step(msg.dt, msg.frame);
		const h = new Float32Array(fluid.h);
		const u = new Float32Array(fluid.u);
		const v = new Float32Array(fluid.v);
		self.postMessage(
			{
				type: "result",
				epoch: msg.epoch,
				h,
				u,
				v,
				spilledVolume: fluid.spilledVolume,
				spills,
			},
			{ transfer: [h.buffer, u.buffer, v.buffer] },
		);
	}
};
