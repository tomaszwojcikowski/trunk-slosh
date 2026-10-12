import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	dismissTutorialsForever,
	nextTutorialHint,
	tutorialMessage,
} from "./tutorials";

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

const quiet = {
	spilled: false,
	handbrake: false,
	highG: false,
	onGrade: false,
	airborne: false,
	elapsed: 1,
};

describe("tutorials", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", memoryStorage());
	});

	it("shows a welcome hint during the first minute", () => {
		expect(nextTutorialHint(quiet)).toBe("welcome");
		expect(tutorialMessage("welcome").length).toBeGreaterThan(10);
		expect(nextTutorialHint({ ...quiet, elapsed: 2 })).toBe(null);
	});

	it("shows the grade hint once on a steep slope", () => {
		nextTutorialHint(quiet);
		expect(nextTutorialHint({ ...quiet, elapsed: 2, onGrade: true })).toBe(
			"grade",
		);
		expect(tutorialMessage("grade")).toMatch(/downhill/);
		expect(nextTutorialHint({ ...quiet, elapsed: 3, onGrade: true })).toBe(
			null,
		);
	});

	it("stays hidden after dismiss, and a cleared store shows the hint again", () => {
		dismissTutorialsForever();
		expect(nextTutorialHint(quiet)).toBe(null);
		localStorage.clear();
		expect(nextTutorialHint(quiet)).toBe("welcome");
	});
});
