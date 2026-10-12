import { CARGO_PARAMS, type CargoPreset } from "../physics/cargoPresets";
import {
	LIQUID_DENSITY,
	TRUNK_FILL_DEPTH,
	TRUNK_LOCAL,
	TRUNK_WALL_HEIGHT,
} from "../physics/trunkConstants";

export type GooFile = {
	version: 1;
	name: string;
	viscosityMul: number;
	pseudoMul: number;
	density: number;
	fillDepth: number;
	wallHeight: number;
};

const KEY = "trunk-slosh-goo";

function clamp(n: number, lo: number, hi: number, fallback: number): number {
	if (!Number.isFinite(n)) return fallback;
	return Math.min(hi, Math.max(lo, n));
}

export function gooFromCargo(
	preset: CargoPreset,
	name: string = preset,
): GooFile {
	const p = CARGO_PARAMS[preset];
	return {
		version: 1,
		name,
		viscosityMul: p.viscosityMul,
		pseudoMul: p.pseudoMul,
		density: LIQUID_DENSITY,
		fillDepth: TRUNK_FILL_DEPTH,
		wallHeight: TRUNK_WALL_HEIGHT,
	};
}

/** Export the tub box, built-in cargos, and the active tuning. */
export function exportGooJson(active: GooFile): string {
	return JSON.stringify(
		{
			version: 1,
			note: "Custom goo sandbox. Edit `active` and import it in Settings.",
			trunk: TRUNK_LOCAL,
			cargos: CARGO_PARAMS,
			active,
		},
		null,
		2,
	);
}

export function parseGoo(raw: unknown): GooFile | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;
	const src =
		obj.active && typeof obj.active === "object"
			? (obj.active as Record<string, unknown>)
			: obj;
	const base = gooFromCargo("water", "Custom goo");
	const name =
		typeof src.name === "string" && src.name.trim()
			? src.name.trim().slice(0, 32)
			: base.name;
	return {
		version: 1,
		name,
		viscosityMul: clamp(Number(src.viscosityMul), 0.4, 3, base.viscosityMul),
		pseudoMul: clamp(Number(src.pseudoMul), 0.4, 2, base.pseudoMul),
		density: clamp(Number(src.density), 400, 1600, base.density),
		fillDepth: clamp(Number(src.fillDepth), 0.08, 0.35, base.fillDepth),
		wallHeight: clamp(Number(src.wallHeight), 0.25, 0.7, base.wallHeight),
	};
}

export function loadStoredGoo(): GooFile | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		return parseGoo(JSON.parse(raw));
	} catch {
		return null;
	}
}

export function saveStoredGoo(goo: GooFile) {
	localStorage.setItem(KEY, JSON.stringify(goo));
}
