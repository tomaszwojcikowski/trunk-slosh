import { describe, expect, it } from "vitest";
import {
	type MusicDrivers,
	musicGroupGainFor,
	musicMixFor,
	nearMissFor,
	threatBias,
} from "./dynamicMusic";

const base: MusicDrivers = {
	speed: 0,
	slosh: 0,
	threat: "ok",
	nearMiss: 0,
	airborne: false,
	impact: 0,
	active: true,
};

describe("dynamic music mix", () => {
	it("stays silent when inactive", () => {
		const mix = musicMixFor({ ...base, speed: 20, active: false });
		expect(mix.bed).toBe(0);
		expect(mix.drive).toBe(0);
		expect(mix.tension).toBe(0);
		expect(mix.air).toBe(0);
		expect(mix.hit).toBe(0);
	});

	it("keeps a bed under a parked truck and opens drive with speed", () => {
		const parked = musicMixFor(base);
		expect(parked.bed).toBeGreaterThan(0.5);
		expect(parked.drive).toBe(0);
		const cruise = musicMixFor({ ...base, speed: 18 });
		expect(cruise.drive).toBeGreaterThan(parked.drive);
		expect(cruise.drive).toBeLessThanOrEqual(1);
	});

	it("raises tension from slosh, cargo threat, and near misses", () => {
		expect(threatBias("ok")).toBe(0);
		expect(threatBias("warn")).toBeGreaterThan(0);
		expect(threatBias("danger")).toBe(1);
		expect(nearMissFor(10)).toBe(0);
		expect(nearMissFor(0.5)).toBeGreaterThan(nearMissFor(3));
		expect(nearMissFor(-0.2)).toBe(1);
		const calm = musicMixFor(base);
		const sloshy = musicMixFor({ ...base, slosh: 1.2 });
		const danger = musicMixFor({ ...base, threat: "danger" });
		const graze = musicMixFor({ ...base, nearMiss: 0.9 });
		expect(sloshy.tension).toBeGreaterThan(calm.tension);
		expect(danger.tension).toBeGreaterThan(calm.tension);
		expect(graze.tension).toBeGreaterThan(calm.tension);
	});

	it("lifts the air layer and softens drive while airborne", () => {
		const ground = musicMixFor({ ...base, speed: 16 });
		const air = musicMixFor({ ...base, speed: 16, airborne: true });
		expect(air.air).toBeGreaterThan(0);
		expect(ground.air).toBe(0);
		expect(air.drive).toBeLessThan(ground.drive);
	});

	it("kicks the hit layer only above the impact threshold", () => {
		expect(musicMixFor({ ...base, impact: 20 }).hit).toBe(0);
		expect(musicMixFor({ ...base, impact: 50 }).hit).toBeGreaterThan(0);
		expect(musicMixFor({ ...base, impact: 200 }).hit).toBeLessThanOrEqual(1);
	});

	it("keeps music under SFX headroom", () => {
		expect(musicGroupGainFor(1)).toBeCloseTo(0.22, 6);
		expect(musicGroupGainFor(0)).toBe(0);
		expect(musicGroupGainFor(2)).toBeCloseTo(0.22, 6);
	});
});
