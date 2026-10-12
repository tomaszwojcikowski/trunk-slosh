import type { DriveInput } from "../physics/VehicleSimulation";
import type { RunConfig } from "./runConfig";

export type ReplayFrame = {
	dt: number;
	input: DriveInput;
};

/** Bumped when grade forces joined the sim. Pre-grade blobs are not treated as matching. */
export const REPLAY_VERSION = 2;

export type ReplayRecording = {
	version: typeof REPLAY_VERSION;
	config: Pick<
		RunConfig,
		"seed" | "mode" | "difficulty" | "cargo" | "vehicle" | "archetype"
	>;
	frames: ReplayFrame[];
};

export class ReplayRecorder {
	private frames: ReplayFrame[] = [];
	private readonly maxFrames = 60 * 120;

	record(dt: number, input: DriveInput) {
		if (this.frames.length >= this.maxFrames) return;
		this.frames.push({
			dt,
			input: {
				throttle: input.throttle,
				steer: input.steer,
				handbrake: input.handbrake,
			},
		});
	}

	export(config: RunConfig): ReplayRecording {
		return {
			version: REPLAY_VERSION,
			config: {
				seed: config.seed,
				mode: config.mode,
				difficulty: config.difficulty,
				cargo: config.cargo,
				vehicle: config.vehicle,
				archetype: config.archetype,
			},
			frames: this.frames,
		};
	}

	clear() {
		this.frames = [];
	}

	toJson(config: RunConfig): string {
		return JSON.stringify(this.export(config));
	}
}
