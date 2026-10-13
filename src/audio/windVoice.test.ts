import { describe, expect, it } from "vitest";
import { impactVoiceFor, windGainFor } from "./windVoice";

describe("wind and impact voices", () => {
	it("is silent when parked and thinner in the air", () => {
		expect(windGainFor(0, false)).toBe(0);
		expect(windGainFor(2.4, false)).toBe(0);
		const grounded = windGainFor(20, false);
		const air = windGainFor(20, true);
		expect(grounded).toBeGreaterThan(0);
		expect(air).toBeGreaterThan(0);
		expect(air).toBeLessThan(grounded);
		expect(grounded).toBeLessThanOrEqual(0.055);
	});

	it("gives rock and barrel different locked voices", () => {
		const rock = impactVoiceFor("rock");
		const barrel = impactVoiceFor("barrel");
		expect(rock.freq).not.toBe(barrel.freq);
		expect(impactVoiceFor(null).freq).toBe(68);
		expect(impactVoiceFor("mystery").freq).toBe(68);
	});
});
