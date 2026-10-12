import { GRADE_G } from "../world/grade";

export type VerticalState = {
	z: number;
	vz: number;
	airborne: boolean;
	airborneTime: number;
};

export function stepVertical(
	state: VerticalState,
	dt: number,
	ground: number,
	aheadGround: number,
	speed: number,
): { state: VerticalState; landedImpact: number } {
	if (state.airborne) {
		const vz = state.vz - GRADE_G * dt;
		const z = state.z + vz * dt;
		const airborneTime = state.airborneTime + dt;
		if (z <= ground) {
			return {
				state: { z: ground, vz: 0, airborne: false, airborneTime },
				landedImpact: Math.abs(vz) * 6,
			};
		}
		return {
			state: { z, vz, airborne: true, airborneTime },
			landedImpact: 0,
		};
	}

	const followVz = (aheadGround - ground) / Math.max(dt, 1e-4);
	if (speed > 8 && followVz < state.vz - GRADE_G * dt) {
		const vz = state.vz - GRADE_G * dt;
		return {
			state: {
				z: state.z + vz * dt,
				vz,
				airborne: true,
				airborneTime: 0,
			},
			landedImpact: 0,
		};
	}
	return {
		state: {
			z: ground,
			vz: (ground - state.z) / Math.max(dt, 1e-4),
			airborne: false,
			airborneTime: 0,
		},
		landedImpact: 0,
	};
}
