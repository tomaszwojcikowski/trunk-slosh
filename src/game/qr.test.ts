import { describe, expect, it } from "vitest";
import { qrMatrix, qrVersionFor } from "./qr";

describe("qr", () => {
	it("builds a version-1 code with finder patterns", () => {
		expect(qrVersionFor("HELLO")).toBe(1);
		const m = qrMatrix("HELLO");
		expect(m).toHaveLength(21);
		expect(m[0][0]).toBe(true);
		expect(m[0][6]).toBe(true);
		expect(m[6][0]).toBe(true);
		expect(m[20][0]).toBe(true);
		expect(m[0][14]).toBe(true);
	});

	it("grows the version when the URL gets longer", () => {
		const url = `https://example.com/trunk-slosh/?seed=12345&mode=contract&difficulty=hard&cargo=volatile&vehicle=short`;
		expect(qrVersionFor(url)).toBeGreaterThan(1);
		const m = qrMatrix(url);
		expect(m.length).toBe(17 + 4 * qrVersionFor(url));
		expect(m.every((row) => row.length === m.length)).toBe(true);
	});
});
