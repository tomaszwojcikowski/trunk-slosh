/**
 * Byte-mode QR codes, error-correction level L, mask 0.
 * Enough for a game URL. No network and no extra package.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
	let x = 1;
	for (let i = 0; i < 255; i++) {
		EXP[i] = x;
		LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d;
	}
	for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return EXP[LOG[a] + LOG[b]];
}

/** Divisor coefficients, highest degree omitted (always 1). Low index is the next-highest term. */
function rsDivisor(degree: number): number[] {
	const result = new Array<number>(degree).fill(0);
	result[degree - 1] = 1;
	let root = 1;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < result.length; j++) {
			result[j] = mul(result[j], root);
			if (j + 1 < result.length) result[j] ^= result[j + 1];
		}
		root = mul(root, 0x02);
	}
	return result;
}

function rsRemainder(data: Uint8Array, divisor: number[]): Uint8Array {
	const result = new Array<number>(divisor.length).fill(0);
	for (const b of data) {
		const factor = b ^ (result.shift() ?? 0);
		result.push(0);
		for (let i = 0; i < result.length; i++)
			result[i] ^= mul(divisor[i], factor);
	}
	return Uint8Array.from(result);
}

type VersionSpec = {
	version: number;
	bytes: number;
	dataCodewords: number;
	blocks: number;
	eccPerBlock: number;
	remainderBits: number;
	align: number[];
};

const VERSIONS: VersionSpec[] = [
	{
		version: 1,
		bytes: 17,
		dataCodewords: 19,
		blocks: 1,
		eccPerBlock: 7,
		remainderBits: 0,
		align: [],
	},
	{
		version: 2,
		bytes: 32,
		dataCodewords: 34,
		blocks: 1,
		eccPerBlock: 10,
		remainderBits: 7,
		align: [6, 18],
	},
	{
		version: 3,
		bytes: 53,
		dataCodewords: 55,
		blocks: 1,
		eccPerBlock: 15,
		remainderBits: 7,
		align: [6, 22],
	},
	{
		version: 4,
		bytes: 78,
		dataCodewords: 80,
		blocks: 1,
		eccPerBlock: 20,
		remainderBits: 7,
		align: [6, 26],
	},
	{
		version: 5,
		bytes: 106,
		dataCodewords: 108,
		blocks: 1,
		eccPerBlock: 26,
		remainderBits: 7,
		align: [6, 30],
	},
	{
		version: 6,
		bytes: 134,
		dataCodewords: 136,
		blocks: 2,
		eccPerBlock: 18,
		remainderBits: 7,
		align: [6, 34],
	},
];

/** ECC L, mask 0. Bit 0 is the least significant bit. */
const FORMAT_L_MASK0 = 0x77c4;

function pickVersion(len: number): VersionSpec {
	const spec = VERSIONS.find((v) => len <= v.bytes);
	if (!spec) throw new Error("URL is too long for a QR code");
	return spec;
}

function pushBits(out: number[], value: number, length: number) {
	for (let i = length - 1; i >= 0; i--) out.push((value >>> i) & 1);
}

function dataCodewords(text: string, spec: VersionSpec): Uint8Array {
	const bytes = new TextEncoder().encode(text);
	const bits: number[] = [];
	pushBits(bits, 0b0100, 4);
	pushBits(bits, bytes.length, 8);
	for (const b of bytes) pushBits(bits, b, 8);
	const capacity = spec.dataCodewords * 8;
	const term = Math.min(4, capacity - bits.length);
	for (let i = 0; i < term; i++) bits.push(0);
	while (bits.length % 8 !== 0) bits.push(0);
	const words: number[] = [];
	for (let i = 0; i < bits.length; i += 8) {
		let v = 0;
		for (let b = 0; b < 8; b++) v = (v << 1) | bits[i + b];
		words.push(v);
	}
	for (let pad = 0; words.length < spec.dataCodewords; pad++)
		words.push(pad % 2 === 0 ? 0xec : 0x11);
	return Uint8Array.from(words);
}

function interleave(data: Uint8Array, spec: VersionSpec): number[] {
	const per = spec.dataCodewords / spec.blocks;
	const divisor = rsDivisor(spec.eccPerBlock);
	const blocks: Uint8Array[] = [];
	const eccs: Uint8Array[] = [];
	for (let i = 0; i < spec.blocks; i++) {
		const block = data.subarray(i * per, (i + 1) * per);
		blocks.push(block);
		eccs.push(rsRemainder(block, divisor));
	}
	const out: number[] = [];
	for (let i = 0; i < per; i++) for (const block of blocks) out.push(block[i]);
	for (let i = 0; i < spec.eccPerBlock; i++)
		for (const ecc of eccs) out.push(ecc[i]);
	const bits: number[] = [];
	for (const word of out) pushBits(bits, word, 8);
	for (let i = 0; i < spec.remainderBits; i++) bits.push(0);
	return bits;
}

function encode(text: string): { modules: boolean[][]; version: number } {
	const spec = pickVersion(new TextEncoder().encode(text).length);
	const n = 17 + 4 * spec.version;
	const dark = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
	const fn = Array.from({ length: n }, () => Array<boolean>(n).fill(false));

	const setFn = (x: number, y: number, on: boolean) => {
		dark[y][x] = on;
		fn[y][x] = true;
	};

	const finder = (x: number, y: number) => {
		for (let dy = -1; dy <= 7; dy++) {
			for (let dx = -1; dx <= 7; dx++) {
				const xx = x + dx;
				const yy = y + dy;
				if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
				const on =
					dx >= 0 &&
					dy >= 0 &&
					dx <= 6 &&
					dy <= 6 &&
					(dx === 0 ||
						dy === 0 ||
						dx === 6 ||
						dy === 6 ||
						(dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
				setFn(xx, yy, on);
			}
		}
	};
	finder(0, 0);
	finder(n - 7, 0);
	finder(0, n - 7);

	for (let i = 0; i < n; i++) {
		if (!fn[6][i]) setFn(i, 6, i % 2 === 0);
		if (!fn[i][6]) setFn(6, i, i % 2 === 0);
	}

	for (const cy of spec.align) {
		for (const cx of spec.align) {
			if (fn[cy][cx]) continue;
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					const on = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
					setFn(cx + dx, cy + dy, on);
				}
			}
		}
	}

	setFn(8, n - 8, true);
	for (let i = 0; i < 9; i++) {
		if (!fn[8][i]) fn[8][i] = true;
		if (!fn[i][8]) fn[i][8] = true;
	}
	for (let i = 0; i < 8; i++) {
		fn[8][n - 1 - i] = true;
		fn[n - 1 - i][8] = true;
	}

	const bits = interleave(dataCodewords(text, spec), spec);
	let iBit = 0;
	let upward = true;
	for (let col = n - 1; col > 0; col -= 2) {
		if (col === 6) col--;
		for (let row = 0; row < n; row++) {
			for (let k = 0; k < 2; k++) {
				const x = col - k;
				const y = upward ? n - 1 - row : row;
				if (fn[y][x]) continue;
				const bit = iBit < bits.length ? bits[iBit++] === 1 : false;
				dark[y][x] = (x + y) % 2 === 0 ? !bit : bit;
			}
		}
		upward = !upward;
	}

	const putFormat = (x: number, y: number, bitIndex: number) => {
		dark[y][x] = ((FORMAT_L_MASK0 >>> bitIndex) & 1) === 1;
	};
	for (let i = 0; i <= 5; i++) putFormat(8, i, i);
	putFormat(8, 7, 6);
	putFormat(8, 8, 7);
	putFormat(7, 8, 8);
	for (let i = 9; i < 15; i++) putFormat(14 - i, 8, i);
	for (let i = 0; i < 8; i++) putFormat(n - 1 - i, 8, i);
	for (let i = 8; i < 15; i++) putFormat(8, n - 15 + i, i);

	return { modules: dark, version: spec.version };
}

export function qrMatrix(text: string): boolean[][] {
	return encode(text).modules;
}

export function qrVersionFor(text: string): number {
	return pickVersion(new TextEncoder().encode(text).length).version;
}
