import { describe, expect, it } from "vitest";
import { Track } from "../world/Track";
import { bendTarget } from "./bendAim";
import { sloshLevel } from "./sloshMeter";

describe("slosh meter", () => {
	it("bands slosh speed into calm, moving, and at the lip", () => {
		expect(sloshLevel(0)).toBe("calm");
		expect(sloshLevel(0.079)).toBe("calm");
		expect(sloshLevel(0.08)).toBe("moving");
		expect(sloshLevel(0.349)).toBe("moving");
		expect(sloshLevel(0.35)).toBe("lip");
		expect(sloshLevel(1.2)).toBe("lip");
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
