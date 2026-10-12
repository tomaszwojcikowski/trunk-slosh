import { describe, expect, it } from "vitest";
import { ParticlePool } from "./Particles";

describe("ParticlePool", () => {
	it("drops spilled liquid ballistically and lands it as puddles", () => {
		const pool = new ParticlePool();
		pool.emit([{ x: 0, y: 0, z: 0.95, vx: 10, vy: 0, vz: 0, volume: 0.004 }]);
		expect(pool.droplets.length).toBeGreaterThan(0);
		for (let i = 0; i < 120; i++) pool.step(1 / 120);
		expect(pool.droplets.length).toBe(0);
		expect(pool.splats.length).toBeGreaterThan(0);
		expect(pool.landedVolume).toBeCloseTo(0.004, 9);
		// ~0.44 s of free fall at ~10 m/s carries the liquid forward
		expect(pool.splats[0].x).toBeGreaterThan(3);
	});

	it("expires effects and clears", () => {
		const pool = new ParticlePool();
		pool.addPuff(0, 0, 1, 0, 0.5);
		pool.addSkid({ x: 0, y: 0 }, { x: 1, y: 0 }, 1);
		pool.addPopup(0, 0, "-1 L");
		for (let i = 0; i < 60 * 20; i++) pool.step(1 / 60);
		expect(pool.puffs.length + pool.skids.length + pool.popups.length).toBe(0);
		pool.emit([{ x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, volume: 0.001 }]);
		pool.clear();
		expect(pool.droplets.length).toBe(0);
	});
});
