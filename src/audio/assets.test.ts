import { describe, expect, it } from "vitest";
import { engineRateFor } from "./AudioBus";
import {
	hasMusicStems,
	MUSIC_URLS,
	SAMPLE_MUSIC_BPM,
	SFX_URLS,
} from "./assets";

describe("sample audio catalog", () => {
	it("ships music stems and a chase-tempo reference", () => {
		expect(SAMPLE_MUSIC_BPM).toBe(152);
		expect(MUSIC_URLS.bed).toContain("/audio/music/");
		expect(SFX_URLS.engine).toContain("/audio/sfx/");
		expect(
			hasMusicStems({
				music: {
					bed: {} as AudioBuffer,
					bass: {} as AudioBuffer,
					drive: {} as AudioBuffer,
					lead: {} as AudioBuffer,
				},
				sfx: {},
			}),
		).toBe(true);
		expect(hasMusicStems({ music: {}, sfx: {} })).toBe(false);
	});

	it("maps engine speed into a sane playback rate", () => {
		expect(engineRateFor(0, 0)).toBeGreaterThanOrEqual(0.55);
		expect(engineRateFor(30, 1)).toBeGreaterThan(engineRateFor(5, 0.2));
		expect(engineRateFor(40, 1)).toBeLessThanOrEqual(1.85);
	});
});
