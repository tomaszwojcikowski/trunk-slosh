import Matter from "matter-js";

const { Events } = Matter;

import { rotate, type Vec2 } from "../math/vec2";
import type { ObstacleKind, Track } from "../world/Track";
import type { FluidFrame, FluidLayer } from "./FluidLayer";
import { TRUNK_LOCAL } from "./trunkConstants";
import { stepVertical, type VerticalState } from "./vertical";
import { advanceWheelAngle, pitchFromLongAccel } from "./wheelPitch";

const HIT_KINDS = new Set<string>(["rock", "cactus", "barrel", "tires"]);

export { TRUNK_LOCAL };

const { Engine, Bodies, Body, Composite } = Matter;

const G = 9.81;
/** Matter integrates with time in milliseconds: 1 N = 1 kg·m/s² = 1e-6 kg·m/ms² */
const NEWTON = 1e-6;
/** Matter velocities are displacement per 1000/60 ms base step */
const BASE_STEPS_PER_SECOND = 60;

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
	/** Simplified Pacejka magic formula: F = μ·Fz·sin(C·atan(B·α)) */
	tireB: 9,
	tireC: 1.5,
};

const SURFACE = {
	road: { mu: 1.0, roll: 0.015 },
	sand: { mu: 0.62, roll: 0.07 },
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
	/** Chassis height above z = 0 (m). Follows the road, then ballistic on a ramp. */
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

/**
 * Top-down car on Matter.js. Matter integrates the chassis and resolves collisions with roadside
 * props; tire forces come from a bicycle model with load transfer, friction circle and a
 * magic-formula tire. The trunk liquid feeds back through its mass and its sloshing center of mass.
 */
export class VehicleSimulation {
	readonly spec = CAR_SPEC;
	private engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
	private chassis: Matter.Body;
	private steerAngle = 0;
	private accelLocal: Vec2 = { x: 0, y: 0 };
	private alpha = 0;
	private gSmooth = 0;
	private impact = 0;
	private impactKind: ObstacleKind | null = null;
	private onRoad = true;
	private vertical: VerticalState = {
		z: 0,
		vz: 0,
		airborne: false,
		airborneTime: 0,
	};
	private wheelAngle = 0;
	private liquidWorld: Vec2 = { x: 0, y: 0 };
	private wheels: WheelInfo[] = [];
	private comHistory: Vec2[] = [];
	private comAccel: Vec2 = { x: 0, y: 0 };
	private lastGood = { pos: { x: 0, y: 0 }, angle: 0 };

	private readonly onCollisionBound = (
		ev: Matter.IEventCollision<Matter.Engine>,
	) => this.onCollision(ev);

	constructor() {
		this.chassis = this.makeChassis({ x: 0, y: 0 }, 0);
		Composite.add(this.engine.world, this.chassis);
		Events.on(this.engine, "collisionStart", this.onCollisionBound);
	}

	reset(track: Track) {
		Composite.clear(this.engine.world, false, true);
		this.chassis = this.makeChassis(track.start, track.startAngle);
		const props = track.obstacles.map((o) =>
			o.dynamic && o.kind === "barrel"
				? Bodies.circle(o.x, o.y, o.r, {
						isStatic: false,
						density: 0.0022,
						friction: 0.55,
						restitution: 0.35,
						label: o.kind,
					})
				: Bodies.circle(o.x, o.y, o.r, {
						isStatic: true,
						friction: 0.5,
						restitution: 0.2,
						label: o.kind,
					}),
		);
		Composite.add(this.engine.world, [this.chassis, ...props]);
		this.steerAngle = 0;
		this.accelLocal = { x: 0, y: 0 };
		this.alpha = 0;
		this.gSmooth = 0;
		this.impact = 0;
		this.impactKind = null;
		this.wheelAngle = 0;
		const along = track.query(track.start).along;
		this.vertical = {
			z: track.heightAt(along),
			vz: 0,
			airborne: false,
			airborneTime: 0,
		};
		this.liquidWorld = track.liquidAccelAt(along);
		this.comHistory = [];
		this.comAccel = { x: 0, y: 0 };
		this.lastGood = { pos: { ...track.start }, angle: track.startAngle };
		this.wheels = this.wheelLocals().map((l) => ({
			world: this.localToWorld(l),
			skid: 0,
			sand: false,
		}));
	}

	private onCollision(ev: Matter.IEventCollision<Matter.Engine>) {
		for (const pair of ev.pairs) {
			const labels = [pair.bodyA.label, pair.bodyB.label];
			if (!labels.includes("chassis")) continue;
			const other =
				pair.bodyA.label === "chassis" ? pair.bodyB.label : pair.bodyA.label;
			if (HIT_KINDS.has(other)) this.impactKind = other as ObstacleKind;
			if (other === "cactus") {
				const v = Body.getVelocity(this.chassis);
				Body.setVelocity(this.chassis, { x: v.x * 0.82, y: v.y * 0.82 });
				Body.setAngularVelocity(
					this.chassis,
					Body.getAngularVelocity(this.chassis) * 0.9,
				);
			}
		}
	}

	private makeChassis(pos: Vec2, angle: number): Matter.Body {
		const s = this.spec;
		const body = Bodies.rectangle(
			pos.x,
			pos.y,
			s.halfLength * 2,
			s.halfWidth * 2,
			{
				chamfer: { radius: [0.55, 0.55, 0.4, 0.4] },
				friction: 0.35,
				frictionAir: 0,
				restitution: 0.15,
				label: "chassis",
			},
		);
		Body.setMass(body, s.mass);
		Body.setInertia(body, s.inertia);
		Body.setAngle(body, angle);
		return body;
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
		return this.chassis.angle;
	}

	localToWorld(local: Vec2): Vec2 {
		const r = rotate(local, this.chassis.angle);
		return {
			x: this.chassis.position.x + r.x,
			y: this.chassis.position.y + r.y,
		};
	}

	velocityWorld(): Vec2 {
		const v = Body.getVelocity(this.chassis);
		return { x: v.x * BASE_STEPS_PER_SECOND, y: v.y * BASE_STEPS_PER_SECOND };
	}

	yawRate(): number {
		return Body.getAngularVelocity(this.chassis) * BASE_STEPS_PER_SECOND;
	}

	/** World velocity of a car-local point (rigid-body velocity field) */
	pointVelocity(local: Vec2): Vec2 {
		const v = this.velocityWorld();
		const w = this.yawRate();
		const r = rotate(local, this.chassis.angle);
		return { x: v.x - w * r.y, y: v.y + w * r.x };
	}

	fluidFrame(): FluidFrame {
		const slope = rotate(this.liquidWorld, -this.chassis.angle);
		return {
			accel: {
				x: clamp(this.accelLocal.x - slope.x, -60, 60),
				y: clamp(this.accelLocal.y - slope.y, -60, 60),
			},
			omega: this.yawRate(),
			alpha: clamp(this.alpha, -40, 40),
		};
	}

	step(dt: number, input: DriveInput, track: Track, fluid: FluidLayer) {
		this.impactKind = null;
		const s = this.spec;
		const c = this.chassis;
		const angle = c.angle;
		const vWorld = this.velocityWorld();
		const omega = this.yawRate();
		const vLocal = rotate(vWorld, -angle);
		const vx = vLocal.x;
		const vy = vLocal.y;
		const speed = Math.hypot(vx, vy);
		const dir = vx >= 0 ? 1 : -1;

		const steerLimit = s.maxSteer / (1 + speed / 16);
		const steerTarget = clamp(input.steer, -1, 1) * steerLimit;
		this.steerAngle += clamp(
			steerTarget - this.steerAngle,
			-s.steerRate * dt,
			s.steerRate * dt,
		);
		const delta = this.steerAngle;

		const locals = this.wheelLocals();
		const sand = locals.map((l) => {
			const q = track.query(this.localToWorld(l));
			return !q.onRoad || track.inWash(q.along);
		});
		const mu = sand.map((x) => (x ? SURFACE.sand.mu : SURFACE.road.mu));
		const muF = (mu[0] + mu[1]) / 2;
		const muR = (mu[2] + mu[3]) / 2;
		const sandShare = sand.filter(Boolean).length / 4;
		let rollCoef =
			SURFACE.road.roll + (SURFACE.sand.roll - SURFACE.road.roll) * sandShare;
		const roadQ = track.query({ x: c.position.x, y: c.position.y });
		this.onRoad = roadQ.onRoad;
		if (!roadQ.onRoad) {
			const sink = Math.min(
				2.25,
				1 +
					speed * 0.045 +
					Math.max(0, roadQ.dist - track.roadWidth * 0.5) * 0.08,
			);
			rollCoef *= sink;
		}

		const liquidMass = fluid.mass();
		const com = fluid.centroidLocal();
		const m = s.mass + liquidMass;
		Body.setMass(c, m);
		Body.setInertia(
			c,
			s.inertia + liquidMass * (com.x * com.x + com.y * com.y),
		);

		const L = s.a + s.b;
		const axLoad = clamp(this.accelLocal.x, -1.5 * G, 1.5 * G);
		const minLoad = 0.15 * m * G;
		const Fzf = Math.max(
			minLoad,
			(m * G * s.b) / L - (m * axLoad * s.cgHeight) / L,
		);
		const Fzr = Math.max(
			minLoad,
			(m * G * s.a) / L + (m * axLoad * s.cgHeight) / L,
		);
		const limF = muF * Fzf;
		const limR = muR * Fzr;

		const thr = clamp(input.throttle, -1, 1);
		let Fxf = 0;
		let Fxr = 0;
		let driving = false;
		const applyBrake = (amount: number) => {
			Fxf = -dir * 0.62 * s.brake * amount;
			Fxr = -dir * 0.38 * s.brake * amount;
		};
		if (thr > 0) {
			if (vx < -0.5) applyBrake(thr);
			else {
				Fxr = thr * Math.min(s.maxDrive, s.enginePower / Math.max(vx, 1));
				driving = true;
			}
		} else if (thr < 0) {
			if (vx > 0.5) applyBrake(-thr);
			else {
				Fxr = thr * s.reverse;
				driving = true;
			}
		}
		if (input.handbrake && Math.abs(vx) > 0.3) Fxr += -dir * limR * 0.8;

		let lockF = false;
		let lockR = false;
		let spinR = false;
		if (Math.abs(Fxf) > limF) {
			Fxf = Math.sign(Fxf) * limF * 0.85;
			lockF = speed > 2;
		}
		if (Math.abs(Fxr) > limR) {
			Fxr = Math.sign(Fxr) * limR * 0.85;
			if (driving) spinR = true;
			else lockR = speed > 2;
		}
		if (input.handbrake && speed > 1) lockR = true;

		const vxa = Math.max(Math.abs(vx), 2);
		const steerBlend = Math.min(1, Math.abs(vx) / 2);
		const alphaF = Math.atan2(vy + omega * s.a, vxa) - delta * dir * steerBlend;
		const alphaR = Math.atan2(vy - omega * s.b, vxa);
		const mf = (a: number) => Math.sin(s.tireC * Math.atan(s.tireB * a));
		const FyF = -limF * mf(alphaF) * (lockF ? 0.5 : 1);
		const util = Math.min(0.98, Math.abs(Fxr) / Math.max(limR, 1));
		const FyR =
			-limR *
			Math.sqrt(1 - util * util) *
			mf(alphaR) *
			(input.handbrake ? 0.45 : 1) *
			(lockR ? 0.6 : 1);

		const cd = Math.cos(delta);
		const sd = Math.sin(delta);
		const frontF = { x: Fxf * cd - FyF * sd, y: Fxf * sd + FyF * cd };
		const rearF = { x: Fxr, y: FyR };

		let Fres = -0.5 * 1.2 * s.cdA * vx * Math.abs(vx);
		if (Math.abs(vx) > 0.4) Fres -= Math.sign(vx) * rollCoef * m * G;
		else if (thr === 0) Fres -= vx * m * 2.5;

		const fluidF = {
			x: -liquidMass * this.comAccel.x,
			y: -liquidMass * this.comAccel.y,
		};

		const apply = (point: Vec2, force: Vec2) => {
			const p = rotate(point, angle);
			const f = rotate(force, angle);
			Body.applyForce(
				c,
				{ x: c.position.x + p.x, y: c.position.y + p.y },
				{ x: f.x * NEWTON, y: f.y * NEWTON },
			);
		};
		const gradeWorld = this.vertical.airborne
			? { x: 0, y: 0 }
			: track.gradeForceAt(roadQ.along);
		const gradeLocal = rotate(gradeWorld, -angle);

		apply({ x: s.a, y: 0 }, frontF);
		apply({ x: -s.b, y: 0 }, rearF);
		apply({ x: 0, y: 0 }, { x: Fres, y: 0 });
		apply(com, fluidF);
		apply({ x: 0, y: 0 }, { x: gradeLocal.x * m, y: gradeLocal.y * m });

		const expected = rotate(
			{
				x: (frontF.x + rearF.x + Fres + fluidF.x) / m,
				y: (frontF.y + rearF.y + fluidF.y) / m,
			},
			angle,
		);
		expected.x += gradeWorld.x;
		expected.y += gradeWorld.y;

		Engine.update(this.engine, dt * 1000);

		if (
			!Number.isFinite(c.position.x) ||
			!Number.isFinite(c.position.y) ||
			!Number.isFinite(c.angle)
		) {
			Body.setPosition(c, this.lastGood.pos);
			Body.setAngle(c, this.lastGood.angle);
			Body.setVelocity(c, { x: 0, y: 0 });
			Body.setAngularVelocity(c, 0);
		} else {
			this.lastGood = {
				pos: { x: c.position.x, y: c.position.y },
				angle: c.angle,
			};
		}

		const vAfter = this.velocityWorld();
		const aWorld = {
			x: (vAfter.x - vWorld.x) / dt,
			y: (vAfter.y - vWorld.y) / dt,
		};
		this.accelLocal = rotate(aWorld, -c.angle);
		this.alpha = (this.yawRate() - omega) / dt;
		this.impact = Math.hypot(aWorld.x - expected.x, aWorld.y - expected.y);
		this.wheelAngle = advanceWheelAngle(this.wheelAngle, speed, dt);
		const landed = this.integrateVertical(dt, track);
		this.impact += landed;
		const qNow = track.query({ x: c.position.x, y: c.position.y });
		this.liquidWorld = this.vertical.airborne
			? { x: 0, y: 0 }
			: track.liquidAccelAt(qNow.along);
		const g = Math.hypot(this.accelLocal.x, this.accelLocal.y) / G;
		this.gSmooth += (Math.min(g, 3) - this.gSmooth) * Math.min(1, dt * 8);

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

		const latF = Math.abs((vy + omega * s.a) * cd - vx * sd);
		const latR = Math.abs(vy - omega * s.b);
		const slide = (lat: number) => clamp((lat - 1.2) / 2.5, 0, 1);
		const longF = lockF ? clamp(speed / 6, 0, 1) : 0;
		const longR = lockR || spinR ? clamp(Math.max(speed, 3) / 6, 0, 1) : 0;
		const skidF = Math.max(slide(latF), longF);
		const skidR = Math.max(slide(latR), longR);
		this.wheels = locals.map((l, i) => ({
			world: this.localToWorld(l),
			skid: i < 2 ? skidF : skidR,
			sand: sand[i],
		}));
	}

	get airborneTime(): number {
		return this.vertical.airborneTime;
	}

	private integrateVertical(dt: number, track: Track): number {
		const q = track.query({
			x: this.chassis.position.x,
			y: this.chassis.position.y,
		});
		const speed = Math.hypot(this.velocityWorld().x, this.velocityWorld().y);
		const ground = track.heightAt(q.along);
		const ahead = track.heightAt(q.along + Math.max(speed, 0) * dt);
		const stepped = stepVertical(this.vertical, dt, ground, ahead, speed);
		this.vertical = stepped.state;
		return stepped.landedImpact;
	}

	snapshot(liquidMass = 0): VehicleSnapshot {
		const v = this.velocityWorld();
		return {
			pos: { x: this.chassis.position.x, y: this.chassis.position.y },
			angle: this.chassis.angle,
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
			z: this.vertical.z,
			pitch: pitchFromLongAccel(this.accelLocal.x),
			wheelAngle: this.wheelAngle,
			airborne: this.vertical.airborne,
			liquidMass,
			halfLength: this.spec.halfLength,
			halfWidth: this.spec.halfWidth,
			trunkLocal: TRUNK_LOCAL,
		};
	}
}
