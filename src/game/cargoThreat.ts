import {
	CONTRACT_ABORT_RATIO,
	finishCargoFloor,
	type RunMode,
} from "./runConfig";

export type CargoThreat = "ok" | "warn" | "danger";

/** Contract warn band sits just above abort so the bar reads before the run dies. */
export const CONTRACT_WARN_RATIO = CONTRACT_ABORT_RATIO + 0.12;

/**
 * Cargo bar threat for the active mode.
 * Practice keeps the familiar full/mid/low bands. Contract and time trial
 * key off abort / finish floors.
 */
export function cargoThreatLevel(ratio: number, mode: RunMode): CargoThreat {
	if (mode === "contract") {
		if (ratio <= CONTRACT_ABORT_RATIO) return "danger";
		if (ratio <= CONTRACT_WARN_RATIO) return "warn";
		return "ok";
	}
	if (mode === "timetrial") {
		const floor = finishCargoFloor("timetrial");
		if (ratio < floor) return "danger";
		if (ratio < floor + 0.08) return "warn";
		return "ok";
	}
	if (ratio > 0.75) return "ok";
	if (ratio > 0.4) return "warn";
	return "danger";
}
