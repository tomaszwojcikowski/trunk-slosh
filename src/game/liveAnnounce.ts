import type { CargoThreat } from "./cargoThreat";
import type { SloshBand } from "./sloshMeter";

export type LiveAnnounceInput = {
	spillLiters?: number;
	band?: SloshBand;
	prevBand?: SloshBand;
	threat?: CargoThreat;
	prevThreat?: CargoThreat;
};

/** Short polite live-region copy. Null when nothing new should be spoken. */
export function liveAnnouncement(input: LiveAnnounceInput): string | null {
	const spill = input.spillLiters ?? 0;
	if (spill >= 0.5) {
		const rounded = spill >= 6 ? spill.toFixed(0) : spill.toFixed(1);
		return `Spilled ${rounded} liters`;
	}
	if (input.band === "lip" && input.prevBand !== "lip")
		return "Slosh at the lip";
	if (input.threat === "danger" && input.prevThreat !== "danger")
		return "Cargo critically low";
	return null;
}
