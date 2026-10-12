import type { CargoPreset } from "./cargoPresets";
import type { FluidFrame, FluidLayer, FluidSpill } from "./FluidLayer";

type WorkerResult = {
	type: "result";
	epoch: number;
	h: Float32Array;
	u: Float32Array;
	v: Float32Array;
	spilledVolume: number;
	spills: FluidSpill[];
};

/**
 * Optional async fluid step. The worker integrates one frame behind the car.
 * Until it is ready, and whenever custom goo is active, the sync solver runs.
 */
export class FluidWorkerClient {
	private worker: Worker | null = null;
	ready = false;
	private readonly fallback: FluidLayer;
	private epoch = 0;
	private busy = false;
	private freshSpills: FluidSpill[] = [];

	constructor(fallback: FluidLayer) {
		this.fallback = fallback;
	}

	/** Drop an in-flight step so a reset is not overwritten by a stale result. */
	invalidate() {
		this.epoch++;
		this.busy = false;
		this.freshSpills = [];
	}

	async init(preset: CargoPreset, enabled: boolean) {
		this.invalidate();
		this.ready = false;
		this.worker?.terminate();
		this.worker = null;
		if (!enabled) return;
		try {
			const worker = new Worker(new URL("./fluidWorker.ts", import.meta.url), {
				type: "module",
			});
			this.worker = worker;
			worker.addEventListener("message", (ev: MessageEvent) => {
				const data = ev.data as { type?: string };
				if (data?.type === "ready") {
					this.ready = true;
					return;
				}
				if (data?.type === "result") this.applyResult(ev.data as WorkerResult);
			});
			worker.addEventListener("error", () => {
				this.ready = false;
				this.busy = false;
			});
			await new Promise<void>((resolve, reject) => {
				const onErr = () => reject(new Error("worker failed"));
				worker.addEventListener("error", onErr, { once: true });
				const onMsg = (ev: MessageEvent) => {
					if ((ev.data as { type?: string })?.type !== "ready") return;
					worker.removeEventListener("message", onMsg);
					worker.removeEventListener("error", onErr);
					resolve();
				};
				worker.addEventListener("message", onMsg);
				worker.postMessage({
					type: "init",
					nx: this.fallback.nx,
					ny: this.fallback.ny,
					preset,
				} satisfies {
					type: "init";
					nx: number;
					ny: number;
					preset: CargoPreset;
				});
			});
			this.ready = true;
		} catch {
			this.worker?.terminate();
			this.worker = null;
			this.ready = false;
		}
	}

	stepSync(dt: number, frame: FluidFrame): FluidSpill[] {
		return this.fallback.step(dt, frame);
	}

	step(dt: number, frame: FluidFrame, allowWorker = true): FluidSpill[] {
		const spills = this.freshSpills;
		this.freshSpills = [];
		if (!allowWorker || !this.worker || !this.ready) {
			return this.stepSync(dt, frame);
		}
		if (!this.busy) {
			const h = this.fallback.h.slice();
			const u = this.fallback.u.slice();
			const v = this.fallback.v.slice();
			const epoch = this.epoch;
			this.busy = true;
			this.worker.postMessage(
				{
					type: "step",
					epoch,
					dt,
					frame,
					h,
					u,
					v,
					spilledVolume: this.fallback.spilledVolume,
				},
				{ transfer: [h.buffer, u.buffer, v.buffer] },
			);
		}
		return spills;
	}

	private applyResult(msg: WorkerResult) {
		if (msg.epoch !== this.epoch) return;
		this.fallback.h.set(msg.h);
		this.fallback.u.set(msg.u);
		this.fallback.v.set(msg.v);
		this.fallback.spilledVolume = msg.spilledVolume;
		this.freshSpills = msg.spills;
		this.busy = false;
	}

	dispose() {
		this.worker?.terminate();
		this.worker = null;
		this.ready = false;
		this.busy = false;
	}
}
