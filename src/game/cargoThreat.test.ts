import { describe, expect, it } from "vitest";
import { CONTRACT_WARN_RATIO, cargoThreatLevel } from "./cargoThreat";
import { CONTRACT_ABORT_RATIO, finishCargoFloor } from "./runConfig";

describe("cargo threat", () => {
	it("marks contract danger at abort and warn in the band above", () => {
		expect(cargoThreatLevel(CONTRACT_ABORT_RATIO, "contract")).toBe("danger");
		expect(cargoThreatLevel(CONTRACT_ABORT_RATIO - 0.01, "contract")).toBe(
			"danger",
		);
		expect(cargoThreatLevel(CONTRACT_WARN_RATIO, "contract")).toBe("warn");
		expect(cargoThreatLevel(CONTRACT_WARN_RATIO + 0.01, "contract")).toBe("ok");
	});

	it("warns near the time-trial finish floor", () => {
		const floor = finishCargoFloor("timetrial");
		expect(cargoThreatLevel(floor - 0.01, "timetrial")).toBe("danger");
		expect(cargoThreatLevel(floor + 0.04, "timetrial")).toBe("warn");
		expect(cargoThreatLevel(0.95, "timetrial")).toBe("ok");
	});

	it("keeps practice bands for a full, mid, and low tank", () => {
		expect(cargoThreatLevel(0.9, "practice")).toBe("ok");
		expect(cargoThreatLevel(0.5, "practice")).toBe("warn");
		expect(cargoThreatLevel(0.2, "practice")).toBe("danger");
	});
});
