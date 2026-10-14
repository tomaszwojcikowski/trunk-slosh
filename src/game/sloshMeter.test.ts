import { describe, expect, it } from "vitest";
import { Track } from "../world/Track";
import { bendTarget } from "./bendAim";
import { nextSloshBand, sloshLevel } from "./sloshMeter";

describe("slosh meter", () => {
	it("bands slosh speed into calm, moving, and at the lip", () => {
		expect(sloshLevel(0)).toBe("calm");
		expect(sloshLevel(0.079)).toBe("calm");
		expect(sloshLevel(0.08)).toBe("moving");
		expect(sloshLevel(0.349)).toBe("moving");
		expect(sloshLevel(0.35)).toBe("lip");
		expect(sloshLevel(1.2)).toBe("lip");
	});

	it("holds the HUD band across a chattering calm/moving boundary", () => {
		let band = nextSloshBand("calm", 0.08);
		expect(band).toBe("moving");
		const chatter = [0.07, 0.09, 0.06, 0.085, 0.055, 0.09];
		const flips: string[] = [band];
		for (const speed of chatter) {
			band = nextSloshBand(band, speed);
			flips.push(band);
		}
		// Exit is 0.05, so 0.055–0.09 stay moving; only a dip below exit drops to calm.
		expect(flips.every((b) => b === "moving")).toBe(true);
		expect(nextSloshBand("moving", 0.04)).toBe("calm");
		expect(nextSloshBand("lip", 0.32)).toBe("lip");
		expect(nextSloshBand("lip", 0.29)).toBe("moving");
	});
});

describe("next bend", () => {
	it("aims at the centerline point a fixed distance ahead", () => {
		const track = new Track(11, { archetype: "flats" });
		const pos = track.pointAt(80).p;
		const ahead = 18;
		const aim = bendTarget(track, pos, ahead);
		const expected = track.pointAt(track.query(pos).along + ahead).p;
		expect(aim.x).toBeCloseTo(expected.x, 6);
		expect(aim.y).toBeCloseTo(expected.y, 6);
		expect(Math.hypot(aim.x - pos.x, aim.y - pos.y)).toBeGreaterThan(8);
	});
});
