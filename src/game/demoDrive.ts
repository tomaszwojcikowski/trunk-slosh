import type { Vec2 } from "../math/vec2";
import type { DriveInput } from "../physics/VehicleSimulation";

/** Lookahead pursuit along the centerline. Powers `?demo`. */
export function demoDrive(
	track: {
		query(pos: Vec2): { along: number };
		pointAt(s: number): { p: Vec2 };
	},
	pos: Vec2,
	angle: number,
	speed: number,
): DriveInput {
	const along = track.query(pos).along;
	const target = track.pointAt(along + 10 + speed * 0.6).p;
	let err = Math.atan2(target.y - pos.y, target.x - pos.x) - angle;
	err = Math.atan2(Math.sin(err), Math.cos(err));
	return {
		throttle: speed < 15 - Math.abs(err) * 22 ? 0.5 : -0.2,
		steer: Math.max(-1, Math.min(1, err * 2.2)),
	};
}
