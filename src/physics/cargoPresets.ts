export type CargoPreset = "water" | "thick" | "volatile";

export type CargoParams = {
	viscosityMul: number;
	pseudoMul: number;
	colorShift: number;
};

export const CARGO_PARAMS: Record<CargoPreset, CargoParams> = {
	water: { viscosityMul: 1, pseudoMul: 1, colorShift: 0 },
	thick: { viscosityMul: 1.85, pseudoMul: 0.75, colorShift: -0.08 },
	volatile: { viscosityMul: 0.92, pseudoMul: 1.38, colorShift: 0.06 },
};
