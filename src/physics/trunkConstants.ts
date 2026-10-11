/** Open liquid tub in the trunk, in car-local meters (origin = center of mass, +x forward). */
export const TRUNK_LOCAL = {
	minX: -2.0,
	maxX: -0.7,
	minY: -0.72,
	maxY: 0.72,
};

/** Tub wall height above the tub floor (m). Liquid above this flows over the lip. */
export const TRUNK_WALL_HEIGHT = 0.45;

/** Initial liquid depth (m). */
export const TRUNK_FILL_DEPTH = 0.18;

/** Height of the tub lip above the road, used as launch height for spilled droplets (m). */
export const TRUNK_LIP_HEIGHT = 0.95;

export const LIQUID_DENSITY = 1000;
