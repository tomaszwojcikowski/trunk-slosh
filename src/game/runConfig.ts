import type { CargoPreset } from "../physics/cargoPresets";
import type { VehiclePreset } from "../physics/vehiclePresets";
import type { Difficulty, TrackArchetype } from "../world/Track";

export type RunMode = "practice" | "contract" | "timetrial";

export type RunConfig = {
	seed: number;
	daily: boolean;
	mode: RunMode;
	difficulty: Difficulty;
	archetype: TrackArchetype | "auto";
	cargo: CargoPreset;
	vehicle: VehiclePreset;
	useFluidWorker: boolean;
	/** Apply the goo JSON saved in Settings. */
	customGoo: boolean;
};

export function dailySeedUtc(d = new Date()): number {
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth() + 1;
	const day = d.getUTCDate();
	return (y * 10_000 + m * 100 + day) >>> 0;
}

function parseMode(raw: string | null): RunMode {
	if (raw === "contract" || raw === "timetrial") return raw;
	return "practice";
}

function parseDifficulty(raw: string | null): Difficulty {
	if (raw === "easy" || raw === "hard") return raw;
	return "medium";
}

function parseArchetype(raw: string | null): TrackArchetype | "auto" {
	if (raw === "flats" || raw === "canyon" || raw === "boulder") return raw;
	return "auto";
}

function parseCargo(raw: string | null): CargoPreset {
	if (raw === "thick" || raw === "volatile") return raw;
	return "water";
}

function parseVehicle(raw: string | null): VehiclePreset {
	if (raw === "short") return raw;
	return "pickup";
}

export function parseRunConfig(
	search: URLSearchParams,
	fallbackSeed?: number,
): RunConfig {
	const daily = search.has("daily");
	const seedParam = search.get("seed");
	let seed = daily ? dailySeedUtc() : Number(seedParam);
	if (!Number.isFinite(seed) || seed <= 0)
		seed = fallbackSeed ?? Math.floor(Math.random() * 1e9);
	seed = Math.floor(seed) >>> 0;

	return {
		seed,
		daily,
		mode: parseMode(search.get("mode")),
		difficulty: parseDifficulty(search.get("difficulty")),
		archetype: parseArchetype(search.get("archetype")),
		cargo: parseCargo(search.get("cargo")),
		vehicle: parseVehicle(search.get("vehicle")),
		useFluidWorker: search.get("worker") === "1",
		customGoo: search.get("goo") === "1",
	};
}

export function runConfigToQuery(cfg: RunConfig): string {
	const q = new URLSearchParams();
	if (cfg.daily) q.set("daily", "1");
	else q.set("seed", String(cfg.seed));
	if (cfg.mode !== "practice") q.set("mode", cfg.mode);
	if (cfg.difficulty !== "medium") q.set("difficulty", cfg.difficulty);
	if (cfg.archetype !== "auto") q.set("archetype", cfg.archetype);
	if (cfg.cargo !== "water") q.set("cargo", cfg.cargo);
	if (cfg.vehicle !== "pickup") q.set("vehicle", cfg.vehicle);
	if (cfg.customGoo) q.set("goo", "1");
	return q.toString();
}

/** Mode-specific cargo floor at finish (fraction kept). */
export function finishCargoFloor(mode: RunMode): number {
	if (mode === "timetrial") return 0.85;
	if (mode === "contract") return 0.5;
	return 0;
}

/** Contract mode: end run early below this fraction. */
export const CONTRACT_ABORT_RATIO = 0.3;
