export type PropKind = "rock" | "cactus" | "barrel" | "tires";

export function rockDrawHeight(r: number, rot: number): number {
	return r * (0.7 + (rot / (Math.PI * 2)) * 0.4);
}

/** Drawn height in meters, matching the solids in the renderer. Not the collision radius. */
export function obstacleDrawHeight(o: {
	kind: PropKind;
	r: number;
	rot: number;
}): number {
	switch (o.kind) {
		case "rock":
			return rockDrawHeight(o.r, o.rot);
		case "cactus":
			return 2.4;
		case "barrel":
			return 0.95;
		case "tires":
			return 0.9;
		default:
			return o.r;
	}
}

export const FLAG_DRAW_HEIGHT = 2.8;
