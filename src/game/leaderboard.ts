import type { RunConfig } from "./runConfig";
import { runConfigToQuery } from "./runConfig";

/** Public, optional. The game never sends a score. */
export const DISCUSSIONS_URL =
	"https://github.com/tomaszwojcikowski/trunk-slosh/discussions";

export function scoreBlurb(
	cfg: RunConfig,
	grade: string,
	kept: number,
	timeLabel: string,
	url: string,
): string {
	const where = cfg.daily ? "daily" : `seed ${cfg.seed}`;
	return [
		`Trunk Slosh ${grade} — ${(kept * 100).toFixed(0)}% kept in ${timeLabel}`,
		`${where}, ${cfg.mode}, ${cfg.difficulty}, ${cfg.cargo}, ${cfg.vehicle}`,
		url || `?${runConfigToQuery(cfg)}`,
	].join("\n");
}
