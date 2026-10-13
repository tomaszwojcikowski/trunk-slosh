import type { RunMode } from "./runConfig";

/** One stakes line for the intro mode picker. Keep under ~90 characters. */
export function modeBlurb(mode: RunMode): string {
	if (mode === "contract")
		return "Contract: finish with enough cargo, or the run ends early.";
	if (mode === "timetrial")
		return "Time trial: race the clock — keep at least 85% in the tub.";
	return "Practice: no fail state. Learn the road and the goo.";
}
