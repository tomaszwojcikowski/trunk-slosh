import type { SloshBand } from "../game/sloshMeter";
import type { CargoPreset } from "../physics/cargoPresets";

/** Slosh-bed cutoff. Thick is darker, volatile is brighter, water is the current bed. */
export function sloshCutoffFor(cargo: CargoPreset): number {
	if (cargo === "thick") return 90;
	if (cargo === "volatile") return 210;
	return 140;
}

/** Short accent on top of the bed. Calm frames stay silent. */
export function lipAccentGain(band: SloshBand, spilling: boolean): number {
	if (band === "lip" || spilling) return 0.1;
	return 0;
}
