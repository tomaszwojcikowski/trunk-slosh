import { describe, expect, it } from "vitest";
import { shiftHex } from "./liquidColor";

describe("shiftHex", () => {
	it("leaves water unchanged and moves thick and volatile apart", () => {
		expect(shiftHex("#4ec42c", 0)).toBe("#4ec42c");
		const thick = shiftHex("#4ec42c", -0.08);
		const volatile = shiftHex("#4ec42c", 0.06);
		expect(thick).not.toBe("#4ec42c");
		expect(volatile).not.toBe("#4ec42c");
		expect(thick).not.toBe(volatile);
	});
});
