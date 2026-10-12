import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	isBetterRun,
	loadBest,
	loadGhostRecording,
	maybeSaveBest,
	saveGhostRecording,
} from "./persistence";
import { REPLAY_VERSION } from "./replay";

function memoryStorage() {
	const data = new Map<string, string>();
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => {
			data.set(key, value);
		},
		removeItem: (key: string) => {
			data.delete(key);
		},
		clear: () => data.clear(),
	};
}

describe("best keys", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", memoryStorage());
	});

	it("keeps a medium best on the old key and stores easy beside it", () => {
		maybeSaveBest("practice", 1, false, "A", 0.9, 40);
		maybeSaveBest("practice", 1, false, "B", 0.5, 90, "easy");
		expect(loadBest("practice", 1, false)?.grade).toBe("A");
		expect(loadBest("practice", 1, false, "medium")?.kept).toBe(0.9);
		expect(loadBest("practice", 1, false, "easy")?.grade).toBe("B");
		expect(loadBest("practice", 1, false, "hard")).toBeNull();
	});

	it("stores an easy ghost apart from the medium ghost", () => {
		const recording = {
			version: REPLAY_VERSION,
			config: {
				seed: 1,
				mode: "practice" as const,
				difficulty: "easy" as const,
				cargo: "water" as const,
				vehicle: "pickup" as const,
				archetype: "auto" as const,
			},
			frames: [],
		};
		saveGhostRecording("practice", 1, false, recording, "easy");
		expect(loadGhostRecording("practice", 1, false)).toBeNull();
		expect(loadGhostRecording("practice", 1, false, "easy")?.version).toBe(
			REPLAY_VERSION,
		);
	});
});

describe("isBetterRun", () => {
	it("ranks time trial by a faster finish", () => {
		const prev = { kept: 0.9, time: 80 };
		expect(isBetterRun("timetrial", prev, { kept: 0.99, time: 90 })).toBe(
			false,
		);
		expect(isBetterRun("timetrial", prev, { kept: 0.86, time: 70 })).toBe(true);
	});

	it("ranks practice and contract by cargo, then time", () => {
		const prev = { kept: 0.8, time: 70 };
		expect(isBetterRun("practice", prev, { kept: 0.9, time: 90 })).toBe(true);
		expect(isBetterRun("contract", prev, { kept: 0.7, time: 40 })).toBe(false);
		expect(
			isBetterRun("practice", { kept: 0.9, time: 80 }, { kept: 0.9, time: 70 }),
		).toBe(true);
	});
});
