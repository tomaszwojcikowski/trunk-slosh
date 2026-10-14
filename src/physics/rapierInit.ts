import RAPIER from "@dimforge/rapier3d-compat";

let initPromise: Promise<typeof RAPIER> | null = null;

/** Load the Rapier WASM module. Safe to call more than once. */
export function initRapier(): Promise<typeof RAPIER> {
	if (!initPromise) {
		initPromise = RAPIER.init().then(() => RAPIER);
	}
	return initPromise;
}

export function getRapier(): typeof RAPIER {
	if (!initPromise) {
		throw new Error("initRapier() must resolve before creating a vehicle");
	}
	return RAPIER;
}

export type Rapier = typeof RAPIER;
