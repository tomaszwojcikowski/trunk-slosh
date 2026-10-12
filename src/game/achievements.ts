import type { RunMode } from "./runConfig";

export type AchievementId =
	| "first-s"
	| "zero-spill"
	| "hard-win"
	| "contract-clear"
	| "daily-clear";

export const ACHIEVEMENTS: Record<AchievementId, string> = {
	"first-s": "First S rank",
	"zero-spill": "Zero-spill finish",
	"hard-win": "Cleared a hard route",
	"contract-clear": "Contract fulfilled",
	"daily-clear": "Daily seed delivered",
};

const ORDER: AchievementId[] = [
	"first-s",
	"zero-spill",
	"hard-win",
	"contract-clear",
	"daily-clear",
];

const KEY = "trunk-slosh-achievements";

export type FinishFacts = {
	grade: string;
	spilled: number;
	difficulty: string;
	archetype: string;
	mode: RunMode;
	daily: boolean;
};

export function earnedFromFinish(
	owned: readonly AchievementId[],
	facts: FinishFacts,
): AchievementId[] {
	const have = new Set(owned);
	const fresh: AchievementId[] = [];
	const grant = (id: AchievementId, ok: boolean) => {
		if (ok && !have.has(id)) fresh.push(id);
	};
	grant("first-s", facts.grade === "S");
	grant("zero-spill", facts.spilled < 1e-6);
	grant(
		"hard-win",
		facts.difficulty === "hard" || facts.archetype === "boulder",
	);
	grant("contract-clear", facts.mode === "contract");
	grant("daily-clear", facts.daily);
	return fresh;
}

export function loadAchievements(): AchievementId[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown[];
		return ORDER.filter((id) => parsed.includes(id));
	} catch {
		return [];
	}
}

export function saveAchievements(ids: readonly AchievementId[]) {
	localStorage.setItem(
		KEY,
		JSON.stringify(ORDER.filter((id) => ids.includes(id))),
	);
}

export function unlockAchievements(facts: FinishFacts): AchievementId[] {
	const owned = loadAchievements();
	const fresh = earnedFromFinish(owned, facts);
	if (fresh.length) saveAchievements([...owned, ...fresh]);
	return fresh;
}

export function achievementLabel(id: AchievementId): string {
	return ACHIEVEMENTS[id];
}
