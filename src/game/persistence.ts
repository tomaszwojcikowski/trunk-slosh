import type { HillDifficulty } from "../world/grade";
import { REPLAY_VERSION, type ReplayRecording } from "./replay";
import type { RunMode } from "./runConfig";

export type StoredBest = {
	grade: string;
	kept: number;
	time: number;
	ts: number;
};

const KEY = "trunk-slosh-bests";

type Store = Record<string, StoredBest>;

function key(
	mode: RunMode,
	seed: number,
	daily: boolean,
	difficulty: HillDifficulty = "medium",
): string {
	const base = `${mode}:${daily ? "daily" : "seed"}:${seed}`;
	if (difficulty === "medium") return base;
	return `${base}:${difficulty}`;
}

function load(): Store {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as Store) : {};
	} catch {
		return {};
	}
}

function save(store: Store) {
	localStorage.setItem(KEY, JSON.stringify(store));
}

export function loadBest(
	mode: RunMode,
	seed: number,
	daily: boolean,
	difficulty: HillDifficulty = "medium",
): StoredBest | null {
	return load()[key(mode, seed, daily, difficulty)] ?? null;
}

/** Time trial ranks by time. Other modes rank by cargo kept, then time. */
export function isBetterRun(
	mode: RunMode,
	prev: { kept: number; time: number } | null,
	next: { kept: number; time: number },
): boolean {
	if (!prev) return true;
	if (mode === "timetrial") return next.time < prev.time - 0.05;
	return (
		next.kept > prev.kept + 1e-6 ||
		(Math.abs(next.kept - prev.kept) < 1e-6 && next.time < prev.time - 0.05)
	);
}

export function maybeSaveBest(
	mode: RunMode,
	seed: number,
	daily: boolean,
	grade: string,
	kept: number,
	time: number,
	difficulty: HillDifficulty = "medium",
): StoredBest | null {
	const k = key(mode, seed, daily, difficulty);
	const store = load();
	const prev = store[k];
	if (!isBetterRun(mode, prev ?? null, { kept, time })) return null;
	const next: StoredBest = { grade, kept, time, ts: Date.now() };
	store[k] = next;
	save(store);
	return next;
}

export function clearStoredBests() {
	localStorage.removeItem(KEY);
	localStorage.removeItem(GHOST_KEY);
}

const GHOST_KEY = "trunk-slosh-ghosts";

function loadGhosts(): Record<string, ReplayRecording> {
	try {
		const raw = localStorage.getItem(GHOST_KEY);
		return raw ? (JSON.parse(raw) as Record<string, ReplayRecording>) : {};
	} catch {
		return {};
	}
}

export function loadGhostRecording(
	mode: RunMode,
	seed: number,
	daily: boolean,
	difficulty: HillDifficulty = "medium",
): ReplayRecording | null {
	const rec = loadGhosts()[key(mode, seed, daily, difficulty)];
	if (rec?.version !== REPLAY_VERSION || !Array.isArray(rec?.frames))
		return null;
	return rec;
}

export function saveGhostRecording(
	mode: RunMode,
	seed: number,
	daily: boolean,
	recording: ReplayRecording,
	difficulty: HillDifficulty = "medium",
) {
	try {
		const store = loadGhosts();
		store[key(mode, seed, daily, difficulty)] = recording;
		localStorage.setItem(GHOST_KEY, JSON.stringify(store));
	} catch {
		// Quota or private mode: the best score still stands without a ghost.
	}
}
