/** Draw fades for spill juice. life === 0 → alpha/scale 0; full life → full value. */

export function lifeRatio(life: number, maxLife: number): number {
	if (maxLife <= 0) return 0;
	return Math.max(0, Math.min(1, life / maxLife));
}

/** Puff fill/stroke alpha from remaining life. */
export function puffAlpha(life: number, maxLife: number): number {
	return lifeRatio(life, maxLife);
}

/** Puff draw scale. Full at birth, shrinks as it dies (Particles still grow radius). */
export function puffScale(life: number, maxLife: number): number {
	const t = lifeRatio(life, maxLife);
	return 0.55 + 0.45 * t;
}

/** Splat soak-out alpha. Full for most of the life, then softens. */
export function splatAlpha(life: number, splatLife: number): number {
	const t = lifeRatio(life, splatLife);
	return Math.min(1, t * 3);
}

/** Skid stroke alpha from remaining life and write strength. */
export function skidAlpha(
	life: number,
	skidLife: number,
	strength: number,
): number {
	const fade = Math.min(1, lifeRatio(life, skidLife) * 2);
	return Math.max(0, Math.min(1, strength)) * fade;
}

/** Popup rises in screen pixels as life burns down. */
export function popupRise(life: number, maxLife: number, travel = 46): number {
	return (1 - lifeRatio(life, maxLife)) * travel;
}

/** Popup alpha: full early, fades near the end. */
export function popupAlpha(life: number, maxLife: number): number {
	const t = lifeRatio(life, maxLife);
	return Math.min(1, t * 3);
}
