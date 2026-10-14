import type { RigidBody, Rotation, World } from "@dimforge/rapier3d-compat";
import { rotate, type Vec2 } from "../math/vec2";
import type { ObstacleKind, Track } from "../world/Track";
import type { FluidFrame, FluidLayer } from "./FluidLayer";
import { getRapier } from "./rapierInit";
import { TRUNK_LOCAL } from "./trunkConstants";
import { advanceWheelAngle, pitchFromLongAccel } from "./wheelPitch";

export { TRUNK_LOCAL };

const G = 9.81;
/** Ground ribbon samples along the centerline (m). Wider than the road for off-road. */
const GROUND_STEP = 5;
const GROUND_HALF_W = 20;
const GROUND_HALF_H = 0.4;

export const CAR_SPEC = {
	mass: 1350,
	inertia: 2300,
	/** CG to front / rear axle (m) */
	a: 1.3,
	b: 1.35,
	cgHeight: 0.55,
	halfLength: 2.25,
	halfWidth: 0.95,
	trackHalf: 0.82,
	maxSteer: 0.58,
	steerRate: 2.8,
	enginePower: 125_000,
	maxDrive: 6500,
	brake: 15_000,
	reverse: 3800,
	cdA: 0.72,
	/** Kept for presets / art; tire response now comes from Rapier's raycast vehicle. */
	tireB: 9,
	tireC: 1.5,
	wheelRadius: 0.38,
	suspensionRest: 0.32,
	chassisHalfHeight: 0.42,
};

const SURFACE = {
	road: { slip: 4.0 },
	sand: { slip: 2.0 },
};

export type DriveInput = {
	throttle: number;
	steer: number;
	handbrake?: boolean;
};

export type WheelInfo = {
	world: Vec2;
	/** 0..1 tire slide intensity (drives skid marks and dust) */
	skid: number;
	sand: boolean;
};

export type VehicleSnapshot = {
	pos: Vec2;
	angle: number;
	/** World velocity (m/s) */
	vel: Vec2;
	speed: number;
	omega: number;
	steerAngle: number;
	accelLocal: Vec2;
	gForce: number;
	onRoad: boolean;
	wheels: WheelInfo[];
	/** Collision-induced acceleration this step (m/s²) */
	impact: number;
	/** Prop kind that produced the latest chassis contact, if known. */
	impactKind: ObstacleKind | null;
	/** Chassis height above z = 0 (m). */
	z: number;
	pitch: number;
	wheelAngle: number;
	airborne: boolean;
	liquidMass: number;
	halfLength: number;
	halfWidth: number;
	trunkLocal: typeof TRUNK_LOCAL;
};

const clamp = (x: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, x));

const HIT_KINDS = new Set<string>(["rock", "cactus", "barrel", "tires"]);

type WheelTuning = {
	stiffness: number;
	compression: number;
	relaxation: number;
	maxForce: number;
	travel: number;
};

const WHEEL_TUNING: WheelTuning = {
	stiffness: 28,
	compression: 2.4,
	relaxation: 3.8,
	maxForce: 14_000,
	travel: 0.34,
};

/** Rapier Y-up yaw for a game heading (game +X forward at angle 0). */
function yawFromGameAngle(angle: number): number {
	return -angle;
}

function gameAngleFromYaw(yaw: number): number {
	return -yaw;
}

function quatFromYaw(yaw: number): Rotation {
	const h = yaw * 0.5;
	return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

function yawFromQuat(q: Rotation): number {
	return Math.atan2(
		2 * (q.w * q.y + q.x * q.z),
		1 - 2 * (q.y * q.y + q.z * q.z),
	);
}

/**
 * Rapier3D raycast vehicle under an isometric top-down game.
 * Game (x,y) ↔ Rapier (x,z); game height z ↔ Rapier y. Fluid coupling stays in FluidFrame.
 */
export class VehicleSimulation {
	readonly spec = CAR_SPEC;
	private world: World | null = null;
	private chassis: RigidBody | null = null;
	private vehicle: ReturnType<World["createVehicleController"]> | null = null;
	private chassisCollider: { setMass(m: number): void } | null = null;
	private kindByCollider = new Map<number, ObstacleKind | "chassis">();
	/** Dynamic props whose Rapier pose is written back onto `track.obstacles`. */
	private dynamicProps: { index: number; body: RigidBody }[] = [];
	private bodyByCollider = new Map<number, RigidBody>();
	private steerAngle = 0;
	private accelLocal: Vec2 = { x: 0, y: 0 };
	private alpha = 0;
	private gSmooth = 0;
	private impact = 0;
	private impactKind: ObstacleKind | null = null;
	private onRoad = true;
	private wheelAngle = 0;
	private liquidWorld: Vec2 = { x: 0, y: 0 };
	private wheels: WheelInfo[] = [];
	private comHistory: Vec2[] = [];
	private comAccel: Vec2 = { x: 0, y: 0 };
	private lastVel: Vec2 = { x: 0, y: 0 };
	private lastOmega = 0;
	private airTime = 0;
	private wasAirborne = false;
	/** Road / flight height for the art pass (ground reference, not COM). */
	private visualZ = 0;
	private lastGood = { pos: { x: 0, y: 0 }, angle: 0 };
	private eventQueue: InstanceType<
		ReturnType<typeof getRapier>["EventQueue"]
	> | null = null;

	reset(track: Track) {
		const RAPIER = getRapier();
		this.eventQueue?.free();
		this.eventQueue = null;
		this.world?.free();
		this.world = null;
		this.chassis = null;
		this.vehicle = null;
		this.chassisCollider = null;
		this.kindByCollider.clear();
		this.dynamicProps = [];
		this.bodyByCollider.clear();

		const world = new RAPIER.World({ x: 0, y: -G, z: 0 });
		world.timestep = 1 / 120;
		this.world = world;
		this.eventQueue = new RAPIER.EventQueue(true);

		this.buildGround(track);
		this.buildObstacles(track);

		const startH = track.heightAt(track.query(track.start).along);
		const yaw = yawFromGameAngle(track.startAngle);
		const ride =
			CAR_SPEC.wheelRadius +
			CAR_SPEC.suspensionRest +
			CAR_SPEC.chassisHalfHeight;
		const chassis = world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(track.start.x, startH + ride, track.start.y)
				.setRotation(quatFromYaw(yaw))
				.setLinearDamping(0.04)
				.setAngularDamping(1.1)
				.setCanSleep(false)
				.setCcdEnabled(true),
		);
		const colDesc = RAPIER.ColliderDesc.cuboid(
			CAR_SPEC.halfLength * 0.92,
			CAR_SPEC.chassisHalfHeight,
			CAR_SPEC.halfWidth * 0.92,
		)
			.setMass(CAR_SPEC.mass)
			.setFriction(0.4)
			.setRestitution(0.12)
			.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
		const col = world.createCollider(colDesc, chassis);
		this.kindByCollider.set(col.handle, "chassis");
		this.chassisCollider = col;
		this.chassis = chassis;

		const vehicle = world.createVehicleController(chassis);
		const places = [
			{ x: CAR_SPEC.a, y: 0, z: -CAR_SPEC.trackHalf },
			{ x: CAR_SPEC.a, y: 0, z: CAR_SPEC.trackHalf },
			{ x: -CAR_SPEC.b, y: 0, z: -CAR_SPEC.trackHalf },
			{ x: -CAR_SPEC.b, y: 0, z: CAR_SPEC.trackHalf },
		];
		for (const pos of places) {
			vehicle.addWheel(
				pos,
				{ x: 0, y: -1, z: 0 },
				{ x: 0, y: 0, z: 1 },
				CAR_SPEC.suspensionRest,
				CAR_SPEC.wheelRadius,
			);
			const i = vehicle.numWheels() - 1;
			vehicle.setWheelSuspensionStiffness(i, WHEEL_TUNING.stiffness);
			vehicle.setWheelSuspensionCompression(i, WHEEL_TUNING.compression);
			vehicle.setWheelSuspensionRelaxation(i, WHEEL_TUNING.relaxation);
			vehicle.setWheelMaxSuspensionForce(i, WHEEL_TUNING.maxForce);
			vehicle.setWheelMaxSuspensionTravel(i, WHEEL_TUNING.travel);
			vehicle.setWheelFrictionSlip(i, SURFACE.road.slip);
			vehicle.setWheelSideFrictionStiffness(i, 1);
		}
		this.vehicle = vehicle;

		this.steerAngle = 0;
		this.accelLocal = { x: 0, y: 0 };
		this.alpha = 0;
		this.gSmooth = 0;
		this.impact = 0;
		this.impactKind = null;
		this.wheelAngle = 0;
		this.airTime = 0;
		this.wasAirborne = false;
		this.visualZ = startH;
		this.liquidWorld = track.liquidAccelAt(track.query(track.start).along);
		this.comHistory = [];
		this.comAccel = { x: 0, y: 0 };
		this.lastVel = { x: 0, y: 0 };
		this.lastOmega = 0;
		this.lastGood = { pos: { ...track.start }, angle: track.startAngle };
		this.wheels = this.wheelLocals().map((l) => ({
			world: this.localToWorld(l),
			skid: 0,
			sand: false,
		}));
		this.onRoad = true;

		// Settle suspension onto the ribbon before the first player step.
		for (let i = 0; i < 12; i++) {
			for (let w = 0; w < 4; w++) {
				vehicle.setWheelEngineForce(w, 0);
				vehicle.setWheelBrake(w, 8);
				vehicle.setWheelSteering(w, 0);
			}
			vehicle.updateVehicle(1 / 120);
			world.step();
		}
		chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
		chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
		const t = chassis.translation();
		this.lastGood = {
			pos: { x: t.x, y: t.z },
			angle: gameAngleFromYaw(yawFromQuat(chassis.rotation())),
		};
		this.lastVel = { x: 0, y: 0 };
		this.lastOmega = 0;
	}

	private buildGround(track: Track) {
		const RAPIER = getRapier();
		const world = this.world!;
		for (let s = 0; s < track.totalLength; s += GROUND_STEP) {
			const s1 = Math.min(track.totalLength, s + GROUND_STEP);
			const a = track.pointAt(s);
			const b = track.pointAt(s1);
			const midX = (a.p.x + b.p.x) * 0.5;
			const midY = (a.p.y + b.p.y) * 0.5;
			const along = (s + s1) * 0.5;
			const h = track.heightAt(along);
			const grade = track.gradeAt(along);
			const bank = track.bankAt(along);
			const gameYaw = Math.atan2(b.p.y - a.p.y, b.p.x - a.p.x);
			const yaw = yawFromGameAngle(gameYaw);
			const pitch = Math.atan(grade);
			const halfLen = Math.max(1.2, (s1 - s) * 0.55);
			const body = world.createRigidBody(
				RAPIER.RigidBodyDesc.fixed().setTranslation(
					midX,
					h - GROUND_HALF_H,
					midY,
				),
			);
			const qYaw = quatFromYaw(yaw);
			const qPitch = {
				x: 0,
				y: 0,
				z: Math.sin(pitch * 0.5),
				w: Math.cos(pitch * 0.5),
			};
			const qBank = {
				x: Math.sin(bank * 0.5),
				y: 0,
				z: 0,
				w: Math.cos(bank * 0.5),
			};
			const q1 = {
				w:
					qYaw.w * qPitch.w -
					qYaw.x * qPitch.x -
					qYaw.y * qPitch.y -
					qYaw.z * qPitch.z,
				x:
					qYaw.w * qPitch.x +
					qYaw.x * qPitch.w +
					qYaw.y * qPitch.z -
					qYaw.z * qPitch.y,
				y:
					qYaw.w * qPitch.y -
					qYaw.x * qPitch.z +
					qYaw.y * qPitch.w +
					qYaw.z * qPitch.x,
				z:
					qYaw.w * qPitch.z +
					qYaw.x * qPitch.y -
					qYaw.y * qPitch.x +
					qYaw.z * qPitch.w,
			};
			const rot = {
				w: q1.w * qBank.w - q1.x * qBank.x - q1.y * qBank.y - q1.z * qBank.z,
				x: q1.w * qBank.x + q1.x * qBank.w + q1.y * qBank.z - q1.z * qBank.y,
				y: q1.w * qBank.y - q1.x * qBank.z + q1.y * qBank.w + q1.z * qBank.x,
				z: q1.w * qBank.z + q1.x * qBank.y - q1.y * qBank.x + q1.z * qBank.w,
			};
			body.setRotation(rot, false);
			world.createCollider(
				RAPIER.ColliderDesc.cuboid(halfLen, GROUND_HALF_H, GROUND_HALF_W)
					.setFriction(1.05)
					.setRestitution(0),
				body,
			);
		}
	}

	private buildObstacles(track: Track) {
		const RAPIER = getRapier();
		const world = this.world!;
		track.obstacles.forEach((o, index) => {
			const dynamic = Boolean(o.dynamic && o.kind === "barrel");
			const body = world.createRigidBody(
				(dynamic
					? RAPIER.RigidBodyDesc.dynamic()
					: RAPIER.RigidBodyDesc.fixed()
				)
					.setTranslation(o.x, o.z + o.r, o.y)
					.setCcdEnabled(dynamic)
					.setLinearDamping(dynamic ? 0.35 : 0)
					.setAngularDamping(dynamic ? 0.55 : 0),
			);
			const desc = RAPIER.ColliderDesc.ball(o.r)
				.setFriction(dynamic ? 0.55 : 0.5)
				.setRestitution(dynamic ? 0.45 : 0.2)
				.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
			if (dynamic) desc.setDensity(220);
			const col = world.createCollider(desc, body);
			this.kindByCollider.set(col.handle, o.kind);
			this.bodyByCollider.set(col.handle, body);
			if (dynamic) this.dynamicProps.push({ index, body });
		});
	}

	/** Copy rolling barrels (and any other dynamic props) back into the track for render. */
	syncProps(track: Track) {
		for (const prop of this.dynamicProps) {
			const o = track.obstacles[prop.index];
			if (!o) continue;
			const t = prop.body.translation();
			if (!Number.isFinite(t.x) || !Number.isFinite(t.z)) continue;
			o.x = t.x;
			o.y = t.z;
			o.z = Math.max(0, t.y - o.r);
			o.rot = gameAngleFromYaw(yawFromQuat(prop.body.rotation()));
		}
	}

	private wheelLocals(): Vec2[] {
		const s = this.spec;
		return [
			{ x: s.a, y: -s.trackHalf },
			{ x: s.a, y: s.trackHalf },
			{ x: -s.b, y: -s.trackHalf },
			{ x: -s.b, y: s.trackHalf },
		];
	}

	get angle(): number {
		if (!this.chassis) return this.lastGood.angle;
		return gameAngleFromYaw(yawFromQuat(this.chassis.rotation()));
	}

	localToWorld(local: Vec2): Vec2 {
		const angle = this.angle;
		const r = rotate(local, angle);
		const t = this.chassis?.translation() ?? {
			x: this.lastGood.pos.x,
			y: 0,
			z: this.lastGood.pos.y,
		};
		return { x: t.x + r.x, y: t.z + r.y };
	}

	velocityWorld(): Vec2 {
		if (!this.chassis) return { x: 0, y: 0 };
		const v = this.chassis.linvel();
		return { x: v.x, y: v.z };
	}

	yawRate(): number {
		if (!this.chassis) return 0;
		// Rapier yaw rate around +Y; game yaw is opposite.
		return -this.chassis.angvel().y;
	}

	pointVelocity(local: Vec2): Vec2 {
		const v = this.velocityWorld();
		const w = this.yawRate();
		const r = rotate(local, this.angle);
		return { x: v.x - w * r.y, y: v.y + w * r.x };
	}

	fluidFrame(): FluidFrame {
		const slope = rotate(this.liquidWorld, -this.angle);
		return {
			accel: {
				x: clamp(this.accelLocal.x - slope.x, -60, 60),
				y: clamp(this.accelLocal.y - slope.y, -60, 60),
			},
			omega: this.yawRate(),
			alpha: clamp(this.alpha, -40, 40),
		};
	}

	get airborneTime(): number {
		return this.airTime;
	}

	step(dt: number, input: DriveInput, track: Track, fluid: FluidLayer) {
		const world = this.world;
		const chassis = this.chassis;
		const vehicle = this.vehicle;
		if (!world || !chassis || !vehicle) {
			throw new Error("VehicleSimulation.reset() required after initRapier()");
		}

		this.impactKind = null;
		this.impact = 0;
		const s = this.spec;
		const angle = this.angle;
		const vWorld = this.velocityWorld();
		const vLocal = rotate(vWorld, -angle);
		const vx = vLocal.x;
		const speed = Math.hypot(vWorld.x, vWorld.y);

		const steerLimit = s.maxSteer / (1 + speed / 16);
		const steerTarget = clamp(input.steer, -1, 1) * steerLimit;
		this.steerAngle += clamp(
			steerTarget - this.steerAngle,
			-s.steerRate * dt,
			s.steerRate * dt,
		);

		const liquidMass = fluid.mass();
		const com = fluid.centroidLocal();
		const m = s.mass + liquidMass;
		this.chassisCollider?.setMass(m);
		chassis.recomputeMassPropertiesFromColliders();

		const thr = clamp(input.throttle, -1, 1);
		let engine = 0;
		let brake = 0;
		// Rapier raycast-vehicle forces are not SI Newtons; tune in controller units.
		const brakeForce = 110;
		const driveForce = 14_000;
		const reverseForce = 4_000;
		if (thr > 0) {
			if (vx < -0.5) brake = thr * brakeForce;
			else {
				// Soft power falloff so top speed stays car-like without starving launch.
				const falloff = 1 / (1 + Math.max(vx, 0) / 18);
				engine = thr * driveForce * falloff;
			}
		} else if (thr < 0) {
			// Hold the brakes until nearly stopped; only then allow reverse.
			if (speed < 0.4 && vx <= 0.25) engine = thr * reverseForce;
			else brake = -thr * brakeForce;
		}
		if (input.handbrake) brake = Math.max(brake, brakeForce * 1.2);

		const locals = this.wheelLocals();
		const sand = locals.map((l) => {
			const q = track.query(this.localToWorld(l));
			return !q.onRoad || track.inWash(q.along);
		});
		const sandShare = sand.filter(Boolean).length / 4;

		// Aero + sand drag as chassis forces (Rapier tires do not model rolling resistance).
		chassis.resetForces(true);
		chassis.resetTorques(true);
		const drag =
			-0.5 * 1.2 * s.cdA * vx * Math.abs(vx) -
			Math.sign(vx || 1) *
				(0.015 + 0.055 * sandShare) *
				m *
				G *
				(speed > 0.4 ? 1 : 0);
		const dragWorld = rotate({ x: drag, y: 0 }, angle);
		chassis.addForce({ x: dragWorld.x, y: 0, z: dragWorld.y }, true);

		const fluidF = {
			x: -liquidMass * this.comAccel.x,
			y: -liquidMass * this.comAccel.y,
		};
		const fWorld = rotate(fluidF, angle);
		const comWorld = this.localToWorld(com);
		const t = chassis.translation();
		chassis.addForceAtPoint(
			{ x: fWorld.x, y: 0, z: fWorld.y },
			{ x: comWorld.x, y: t.y, z: comWorld.y },
			true,
		);

		for (let i = 0; i < 4; i++) {
			const front = i < 2;
			const driven = !front;
			// Rapier/Bullet steering sign is opposite our game +steer → +yaw convention.
			vehicle.setWheelSteering(i, front ? -this.steerAngle : 0);
			vehicle.setWheelEngineForce(i, driven ? engine * 0.5 : 0);
			let wheelBrake = front ? brake * 0.62 : brake * 0.38;
			if (input.handbrake && !front)
				wheelBrake = Math.max(wheelBrake, brakeForce);
			vehicle.setWheelBrake(i, wheelBrake);
			const slip = sand[i] ? SURFACE.sand.slip : SURFACE.road.slip;
			vehicle.setWheelFrictionSlip(
				i,
				input.handbrake && !front ? slip * 0.4 : slip,
			);
		}

		world.timestep = dt;
		vehicle.updateVehicle(dt);

		const events = this.eventQueue!;
		world.step(events);
		const speedBeforeHit = Math.hypot(vWorld.x, vWorld.y);
		events.drainCollisionEvents((h1, h2, started) => {
			if (!started) return;
			const k1 = this.kindByCollider.get(h1);
			const k2 = this.kindByCollider.get(h2);
			const otherHandle = k1 === "chassis" ? h2 : k2 === "chassis" ? h1 : -1;
			const other = k1 === "chassis" ? k2 : k2 === "chassis" ? k1 : undefined;
			if (!other || other === "chassis" || !HIT_KINDS.has(other)) return;
			this.impactKind = other as ObstacleKind;
			const hit = Math.min(90, 18 + speedBeforeHit * 4.5);
			this.impact = Math.max(this.impact, hit);
			if (other === "cactus") {
				const v = chassis.linvel();
				chassis.setLinvel({ x: v.x * 0.78, y: v.y, z: v.z * 0.78 }, true);
				const w = chassis.angvel();
				chassis.setAngvel({ x: w.x, y: w.y * 0.85, z: w.z }, true);
			} else if (other === "rock" || other === "tires") {
				const v = chassis.linvel();
				chassis.setLinvel({ x: v.x * 0.88, y: v.y, z: v.z * 0.88 }, true);
			} else if (other === "barrel") {
				const body = this.bodyByCollider.get(otherHandle);
				if (body) {
					const v = chassis.linvel();
					const kick = 0.55 + Math.min(1.2, speedBeforeHit * 0.08);
					body.applyImpulse(
						{ x: v.x * kick, y: 1.8 + speedBeforeHit * 0.12, z: v.z * kick },
						true,
					);
					body.applyTorqueImpulse(
						{
							x: (Math.random() - 0.5) * 4,
							y: 2.5,
							z: (Math.random() - 0.5) * 4,
						},
						true,
					);
				}
			}
		});

		const tAfter = chassis.translation();
		const ang = gameAngleFromYaw(yawFromQuat(chassis.rotation()));
		if (
			!Number.isFinite(tAfter.x) ||
			!Number.isFinite(tAfter.z) ||
			!Number.isFinite(ang)
		) {
			chassis.setTranslation(
				{ x: this.lastGood.pos.x, y: tAfter.y, z: this.lastGood.pos.y },
				true,
			);
			chassis.setRotation(
				quatFromYaw(yawFromGameAngle(this.lastGood.angle)),
				true,
			);
			chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
			chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
		} else {
			this.lastGood = { pos: { x: tAfter.x, y: tAfter.z }, angle: ang };
		}

		const vAfter = this.velocityWorld();
		const aWorld = {
			x: (vAfter.x - this.lastVel.x) / Math.max(dt, 1e-4),
			y: (vAfter.y - this.lastVel.y) / Math.max(dt, 1e-4),
		};
		// Strip gravity-ish vertical; planar accel feeds the tub.
		this.accelLocal = rotate(aWorld, -this.angle);
		const omegaAfter = this.yawRate();
		this.alpha = (omegaAfter - this.lastOmega) / Math.max(dt, 1e-4);
		this.lastVel = vAfter;
		this.lastOmega = omegaAfter;

		const wheelsInAir = [0, 1, 2, 3].filter(
			(i) => !vehicle.wheelIsInContact(i),
		).length;
		const airborne = wheelsInAir >= 3;
		if (airborne) {
			this.airTime = this.wasAirborne ? this.airTime + dt : dt;
		} else if (this.wasAirborne) {
			this.impact += Math.abs(chassis.linvel().y) * 6;
			this.airTime = 0;
		} else {
			this.airTime = 0;
		}
		this.wasAirborne = airborne;

		const qNow = track.query({ x: tAfter.x, y: tAfter.z });
		this.onRoad = qNow.onRoad;
		this.liquidWorld = airborne
			? { x: 0, y: 0 }
			: track.liquidAccelAt(qNow.along);
		const ride =
			CAR_SPEC.wheelRadius +
			CAR_SPEC.suspensionRest +
			CAR_SPEC.chassisHalfHeight;
		this.visualZ = airborne ? tAfter.y - ride : track.heightAt(qNow.along);

		const g = Math.hypot(this.accelLocal.x, this.accelLocal.y) / G;
		this.gSmooth += (Math.min(g, 3) - this.gSmooth) * Math.min(1, dt * 8);
		this.wheelAngle = advanceWheelAngle(this.wheelAngle, speed, dt);

		this.comHistory.push(com);
		if (this.comHistory.length > 3) this.comHistory.shift();
		if (this.comHistory.length === 3) {
			const [c0, c1, c2] = this.comHistory;
			const raw = {
				x: clamp((c2.x - 2 * c1.x + c0.x) / (dt * dt), -40, 40),
				y: clamp((c2.y - 2 * c1.y + c0.y) / (dt * dt), -40, 40),
			};
			this.comAccel.x += (raw.x - this.comAccel.x) * 0.15;
			this.comAccel.y += (raw.y - this.comAccel.y) * 0.15;
		}

		const braking = brake > 100 || Boolean(input.handbrake);
		this.wheels = locals.map((l, i) => {
			const lat = Math.abs(rotate(this.pointVelocity(l), -this.angle).y);
			const slide = clamp((lat - 0.7) / 2.0, 0, 1);
			const lock = braking && speed > 1.5 ? clamp(speed / 6, 0, 1) : 0;
			const skid = Math.max(slide, lock, sand[i] ? 0.2 : 0);
			return {
				world: this.localToWorld(l),
				skid,
				sand: sand[i],
			};
		});
	}

	snapshot(liquidMass = 0): VehicleSnapshot {
		const v = this.velocityWorld();
		const t = this.chassis?.translation();
		return {
			pos: t ? { x: t.x, y: t.z } : { ...this.lastGood.pos },
			angle: this.angle,
			vel: v,
			speed: Math.hypot(v.x, v.y),
			omega: this.yawRate(),
			steerAngle: this.steerAngle,
			accelLocal: { ...this.accelLocal },
			gForce: this.gSmooth,
			onRoad: this.onRoad,
			wheels: this.wheels.map((w) => ({
				world: { ...w.world },
				skid: w.skid,
				sand: w.sand,
			})),
			impact: this.impact,
			impactKind: this.impactKind,
			z: this.visualZ,
			pitch: pitchFromLongAccel(this.accelLocal.x),
			wheelAngle: this.wheelAngle,
			airborne: this.wasAirborne,
			liquidMass,
			halfLength: this.spec.halfLength,
			halfWidth: this.spec.halfWidth,
			trunkLocal: TRUNK_LOCAL,
		};
	}
}
