import type { Vec2 } from "../math/vec2";

/** Meters of centerline ahead of the truck. Long enough to sit on the road, not on the cab. */
export const BEND_AHEAD = 18;

export function bendTarget(
	track: {
		query(pos: Vec2): { along: number };
		pointAt(s: number): { p: Vec2 };
	},
	pos: Vec2,
	ahead = BEND_AHEAD,
): Vec2 {
	const along = track.query(pos).along;
	return track.pointAt(along + ahead).p;
}
