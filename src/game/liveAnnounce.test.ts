import { describe, expect, it } from "vitest";
import { liveAnnouncement } from "./liveAnnounce";

describe("live announcements", () => {
	it("skips quiet frames and announces rising edges", () => {
		expect(liveAnnouncement({ spillLiters: 0 })).toBeNull();
		expect(liveAnnouncement({ spillLiters: 0.2 })).toBeNull();
		expect(liveAnnouncement({ spillLiters: 1.2 })).toBe("Spilled 1.2 liters");
		expect(liveAnnouncement({ spillLiters: 8 })).toBe("Spilled 8 liters");
		expect(liveAnnouncement({ band: "lip", prevBand: "moving" })).toBe(
			"Slosh at the lip",
		);
		expect(liveAnnouncement({ band: "lip", prevBand: "lip" })).toBeNull();
		expect(liveAnnouncement({ threat: "danger", prevThreat: "warn" })).toBe(
			"Cargo critically low",
		);
		expect(
			liveAnnouncement({ threat: "danger", prevThreat: "danger" }),
		).toBeNull();
	});
});
