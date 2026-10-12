import type { CargoPreset } from "../physics/cargoPresets";
import { FluidLayer } from "../physics/FluidLayer";
import {
	VehicleSimulation,
	type VehicleSnapshot,
} from "../physics/VehicleSimulation";
import type { Track } from "../world/Track";
import type { GooFile } from "./goo";
import type { ReplayRecording } from "./replay";
import type { RunConfig } from "./runConfig";

export function ghostMatches(rec: ReplayRecording, cfg: RunConfig): boolean {
	return (
		rec.version === 1 &&
		rec.config.seed === cfg.seed &&
		rec.config.mode === cfg.mode &&
		rec.config.difficulty === cfg.difficulty &&
		rec.config.cargo === cfg.cargo &&
		rec.config.vehicle === cfg.vehicle &&
		rec.config.archetype === cfg.archetype
	);
}

/** Replays a stored best on its own vehicle and fluid, beside the live car. */
export class GhostRunner {
	private readonly vehicle = new VehicleSimulation();
	readonly fluid = new FluidLayer();
	private recording: ReplayRecording | null = null;
	private track: Track | null = null;
	private index = 0;

	load(recording: ReplayRecording | null) {
		this.recording = recording;
		this.index = 0;
	}

	get active(): boolean {
		return (this.recording?.frames.length ?? 0) > 0;
	}

	reset(track: Track, cargo: CargoPreset, goo: GooFile | null) {
		this.track = track;
		this.index = 0;
		this.vehicle.reset(track);
		if (goo) this.fluid.applyGoo(goo);
		else {
			this.fluid.reset();
			this.fluid.setCargoPreset(cargo);
		}
	}

	step() {
		const frames = this.recording?.frames;
		if (!this.track || !frames || this.index >= frames.length) return;
		const frame = frames[this.index++];
		this.vehicle.step(frame.dt, frame.input, this.track, this.fluid);
		this.fluid.step(frame.dt, this.vehicle.fluidFrame());
	}

	snapshot(): VehicleSnapshot | null {
		if (!this.active || this.index === 0) return null;
		return this.vehicle.snapshot();
	}
}
