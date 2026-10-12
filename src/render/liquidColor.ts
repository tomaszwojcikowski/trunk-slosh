/** Shift a #rrggbb color’s hue. `shift` is a fraction of the hue wheel. */

export function shiftHex(hex: string, shift: number): string {
	const raw = hex.replace("#", "");
	if (shift === 0) return `#${raw.toLowerCase()}`;
	const n = Number.parseInt(raw, 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	const d = max - min;
	if (d > 1e-8) {
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h /= 6;
	}
	h = (h + shift) % 1;
	if (h < 0) h += 1;
	const [rr, gg, bb] = hslToRgb(h, s, l);
	const byte = (v: number) =>
		Math.round(Math.min(1, Math.max(0, v)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${byte(rr)}${byte(gg)}${byte(bb)}`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hue = (t: number) => {
		let x = t;
		if (x < 0) x += 1;
		if (x > 1) x -= 1;
		if (x < 1 / 6) return p + (q - p) * 6 * x;
		if (x < 1 / 2) return q;
		if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
		return p;
	};
	return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}
