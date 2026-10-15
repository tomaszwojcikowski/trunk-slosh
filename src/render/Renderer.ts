import { rotate, type Vec2 } from "../math/vec2";
import type { FluidLayer } from "../physics/FluidLayer";
import { type ParticlePool, SKID_LIFE, SPLAT_LIFE } from "../physics/Particles";
import {
	popupAlpha,
	popupRise,
	puffAlpha,
	puffScale,
	skidAlpha,
	splatAlpha,
} from "../physics/particleFade";
import { TRUNK_LIP_HEIGHT } from "../physics/trunkConstants";
import type { VehicleSnapshot } from "../physics/VehicleSimulation";
import { CAR_SPEC } from "../physics/VehicleSimulation";
import { bankedHeight, cosineBump, RAMP_HALF, WASH_HALF } from "../world/grade";
import {
	type Decor,
	mulberry32,
	type Obstacle,
	type Track,
} from "../world/Track";
import { axleLayout, scaledBodyPoint } from "./axleLayout";
import {
	ISO_COS,
	ISO_SIN,
	type IsoGroundTransform,
	isoCameraPixelOffset,
	isoGroundTransform,
	isoInView,
} from "./isoProject";
import { centroid, convexHull, frustumSideFaces } from "./isoSolids";
import { shiftHex } from "./liquidColor";
import {
	FLAG_DRAW_HEIGHT,
	obstacleDrawHeight,
	rockDrawHeight,
} from "./propHeight";
import {
	asphaltForLit,
	bankHighlight,
	embankDepth,
	faceLit,
	gradeTint,
	needsGradeCrease,
	ROAD_CURB,
	roadShadeScore,
	roadSurfaceNormal,
	shoulderForLit,
} from "./roadSlope";
import { SUN, SUN_2D, shadowOffset } from "./sun";
import { drawTubMesh } from "./trunkMeshDraw";

export type Camera = {
	x: number;
	y: number;
	/** CSS pixels per meter */
	zoom: number;
};

export type RenderFrame = {
	track: Track;
	car: VehicleSnapshot;
	fluid: FluidLayer;
	ghost?: { car: VehicleSnapshot; fluid: FluidLayer };
	particles: ParticlePool;
	camera: Camera;
	time: number;
	debug: boolean;
	/** Next-bend target on the centerline, drawn on the road. */
	chevron?: Vec2;
};

export const INK = "#1b120b";

const C = {
	sand: "#e2a95f",
	patchDark: "#d49b54",
	patchLight: "#ebb872",
	asphalt: "#7a6c5f",
	shoulder: "#a8733e",
	edgeLine: "#f1e4c2",
	centerLine: "#ffc63a",
	roadCrack: "#3b322a",
	oil: "#474037",
	rock: "#9d8366",
	rockShade: "#6d5843",
	rockTop: "#c6ad8b",
	cactus: "#55a03f",
	cactusShade: "#2f6b2b",
	cactusTop: "#7cc35a",
	barrel: "#d03c2d",
	barrelShade: "#8c2219",
	barrelBand: "#f2c230",
	tire: "#3a3a3a",
	tireShade: "#1f1f1f",
	body: "#f6b72f",
	bodyShade: "#b56c18",
	roof: "#f0a630",
	stripe: "#9b2416",
	glass: "#7fc3d6",
	glassShade: "#4d8799",
	liquidDeep: [24, 112, 32],
	liquidMid: [78, 196, 44],
	liquidLight: [170, 243, 84],
	shadow: "rgba(55, 22, 0, 0.6)",
};

/** Height of the truck bed / tub lip above the road (m). */
const BED_TOP = TRUNK_LIP_HEIGHT;
const BODY_BOTTOM = 0.4;
const CAB_TOP = 1.62;
const HOOD_TOP = BED_TOP + 0.16;
const RAIL_TOP = BED_TOP + 0.22;

const CAR_OUTLINE: Vec2[] = [
	{ x: 2.25, y: -0.5 },
	{ x: 2.1, y: -0.78 },
	{ x: 1.6, y: -0.86 },
	{ x: 0.9, y: -0.8 },
	{ x: -0.6, y: -0.82 },
	{ x: -1.95, y: -0.86 },
	{ x: -2.28, y: -0.68 },
	{ x: -2.28, y: 0.68 },
	{ x: -1.95, y: 0.86 },
	{ x: -0.6, y: 0.82 },
	{ x: 0.9, y: 0.8 },
	{ x: 1.6, y: 0.86 },
	{ x: 2.1, y: 0.78 },
	{ x: 2.25, y: 0.5 },
];

const CAB_OUTLINE: Vec2[] = [
	{ x: 0.98, y: -0.7 },
	{ x: 0.98, y: 0.7 },
	{ x: -0.64, y: 0.7 },
	{ x: -0.64, y: -0.7 },
];

type Colors = { top: string; lit: string; shade: string };

function polygonPath(points: Vec2[]): Path2D {
	const p = new Path2D();
	points.forEach((pt, i) =>
		i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y),
	);
	p.closePath();
	return p;
}

function circlePath(x: number, y: number, r: number): Path2D {
	const p = new Path2D();
	p.arc(x, y, r, 0, Math.PI * 2);
	return p;
}

function roundRectPath(
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): Path2D {
	const p = new Path2D();
	p.moveTo(x + r, y);
	p.lineTo(x + w - r, y);
	p.quadraticCurveTo(x + w, y, x + w, y + r);
	p.lineTo(x + w, y + h - r);
	p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	p.lineTo(x + r, y + h);
	p.quadraticCurveTo(x, y + h, x, y + h - r);
	p.lineTo(x, y + r);
	p.quadraticCurveTo(x, y, x + r, y);
	p.closePath();
	return p;
}

const rgb = (c: number[], a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

const shrink = (pts: Vec2[], k: number): Vec2[] => {
	const c = centroid(pts);
	return pts.map((p) => ({
		x: c.x + (p.x - c.x) * k,
		y: c.y + (p.y - c.y) * k,
	}));
};

const offset = (pts: Vec2[], o: Vec2): Vec2[] =>
	pts.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));

type Solid = { depth: number; draw: () => void };

/**
 * Draws the true-isometric comic scene into an offscreen canvas; the ink shader finishes it.
 * The ground plane is drawn through an affine iso matrix; everything with height is a
 * depth-sorted solid drawn in screen space.
 */
export class Renderer {
	readonly canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private readonly mainCtx: CanvasRenderingContext2D;
	private ghostCanvas: HTMLCanvasElement | null = null;
	private pixelRatio = 1;
	private s = 1;
	private view: IsoGroundTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
	private readonly shapeCache = new WeakMap<object, Path2D>();
	private readonly carPath = polygonPath(CAR_OUTLINE);

	constructor() {
		this.canvas = document.createElement("canvas");
		const ctx = this.canvas.getContext("2d", { alpha: false });
		if (!ctx) throw new Error("2D canvas unavailable");
		this.ctx = ctx;
		this.mainCtx = ctx;
	}

	resize(cssWidth: number, cssHeight: number, pixelRatio: number) {
		this.pixelRatio = pixelRatio;
		this.canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
		this.canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
	}

	/** Scene pixels per meter */
	scale(camera: Camera): number {
		return camera.zoom * this.pixelRatio;
	}

	hatchOffset(camera: Camera): { x: number; y: number } {
		return isoCameraPixelOffset(camera, this.scale(camera));
	}

	/** World meters to scene pixels. */
	private P(x: number, y: number, z: number): Vec2 {
		const m = this.view;
		return {
			x: m.a * x + m.c * y + m.e,
			y: m.b * x + m.d * y + m.f - z * this.s,
		};
	}

	/** Canvas transform for drawing in world meters on the horizontal plane at height z. */
	private planeAt(z: number) {
		const m = this.view;
		this.ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f - z * this.s);
	}

	private screenSpace() {
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
	}

	draw(f: RenderFrame) {
		const { ctx, canvas } = this;
		const W = canvas.width;
		const H = canvas.height;
		const cam = f.camera;
		this.s = this.scale(cam);
		this.view = isoGroundTransform(cam, this.s, W, H);
		const s = this.s;

		this.screenSpace();
		ctx.fillStyle = C.sand;
		ctx.fillRect(0, 0, W, H);
		this.planeAt(0);
		ctx.lineJoin = "round";
		ctx.lineCap = "round";

		const halfW = W / (2 * s);
		const halfH = H / (2 * s);
		const inView = (x: number, y: number, r: number, h = 0) =>
			isoInView(x - cam.x, y - cam.y, r, h, halfW, halfH);

		this.drawGround(f.track, inView);
		this.drawRoad(f.track, inView);
		this.drawRoadDecor(f.track, inView);
		this.drawSplats(f.particles, inView);
		this.drawSkids(f.particles);

		const obstacles = f.track.obstacles.filter((o) =>
			inView(o.x, o.y, o.r * 2.2, obstacleDrawHeight(o)),
		);
		ctx.fillStyle = C.shadow;
		ctx.strokeStyle = C.shadow;
		for (const o of obstacles) this.obstacleShadow(f.track, o);
		const flagZ = f.track.heightAt(f.track.finishS);
		this.flagShadows(f.track);
		this.carShadow(f.track, f.car);
		this.drawDropletShadows(f.particles);

		const solids: Solid[] = obstacles.map((o) => ({
			depth: o.x + o.y,
			draw: () => this.drawObstacle(o),
		}));
		for (const flag of this.flagPositions(f.track)) {
			if (!inView(flag.x, flag.y, 1.6, FLAG_DRAW_HEIGHT)) continue;
			solids.push({
				depth: flag.x + flag.y + flagZ,
				draw: () => this.drawFlag(flag, f.track.finishAngle, flagZ),
			});
		}
		const ghost = f.ghost;
		if (ghost) {
			solids.push({
				depth: ghost.car.pos.x + ghost.car.pos.y,
				draw: () => this.drawGhost(ghost.car, ghost.fluid),
			});
		}
		solids.push({
			depth: f.car.pos.x + f.car.pos.y,
			draw: () => this.drawCar(f.car, f.fluid),
		});
		solids.sort((a, b) => a.depth - b.depth);
		for (const solid of solids) {
			this.screenSpace();
			solid.draw();
		}

		if (f.chevron) this.drawChevron(f.track, f.chevron);
		this.screenSpace();
		this.drawDroplets(f.particles, f.fluid);
		this.drawPuffs(f.particles);
		if (f.debug) {
			this.planeAt(0);
			this.drawDebug(f.car, f.fluid);
		}

		this.screenSpace();
		this.drawPopups(f.particles);
	}

	private cel(
		path: Path2D,
		shade: string,
		base: string,
		ox: number,
		oy: number,
		ink: number,
	) {
		const ctx = this.ctx;
		ctx.fillStyle = shade;
		ctx.fill(path);
		ctx.save();
		ctx.clip(path);
		ctx.translate(ox, oy);
		ctx.fillStyle = base;
		ctx.fill(path);
		ctx.restore();
		if (ink > 0) {
			ctx.lineWidth = ink;
			ctx.strokeStyle = INK;
			ctx.stroke(path);
		}
	}

	private cached(key: object, build: () => Path2D): Path2D {
		let p = this.shapeCache.get(key);
		if (!p) {
			p = build();
			this.shapeCache.set(key, p);
		}
		return p;
	}

	// ---------- Solids (screen space) ----------

	private fillScreenPoly(pts: Vec2[], fill: string, ink: number) {
		const ctx = this.ctx;
		ctx.beginPath();
		pts.forEach((p, i) =>
			i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
		);
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();
		if (ink > 0) {
			ctx.lineWidth = ink;
			ctx.strokeStyle = INK;
			ctx.stroke();
		}
	}

	/** Vertical frustum: `base` (world meters) at z0, shrunk by `topScale` at z1. */
	private prism(
		base: Vec2[],
		z0: number,
		z1: number,
		colors: Colors,
		inkM: number,
		topScale = 1,
		topDetail?: () => void,
		lift?: (index: number) => number,
	) {
		const top = topScale === 1 ? base : shrink(base, topScale);
		const { faces, topScreen } = frustumSideFaces(
			base,
			top,
			z0,
			z1,
			(x, y, z) => this.P(x, y, z),
			lift,
		);
		const ink = inkM * this.s;
		for (const face of faces) {
			const lit = face.normal.x * SUN_2D.x + face.normal.y * SUN_2D.y > 0.1;
			this.fillScreenPoly(face.quad, lit ? colors.lit : colors.shade, ink);
		}
		this.fillScreenPoly(topScreen, colors.top, ink);
		if (topDetail) {
			const ctx = this.ctx;
			ctx.save();
			ctx.beginPath();
			topScreen.forEach((p, i) =>
				i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
			);
			ctx.closePath();
			ctx.clip();
			this.planeAt(z1);
			topDetail();
			ctx.restore();
			this.screenSpace();
		}
	}

	/** Upright cylinder centred on (x, y) from z0 to z1. Returns the screen ellipse of the lid. */
	private cylinder(
		x: number,
		y: number,
		r: number,
		z0: number,
		z1: number,
		colors: Colors,
		inkM: number,
	) {
		const ctx = this.ctx;
		const b = this.P(x, y, z0);
		const t = this.P(x, y, z1);
		const rx = r * this.s * Math.SQRT2 * ISO_COS;
		const ry = r * this.s * Math.SQRT2 * ISO_SIN;
		const ink = inkM * this.s;
		const side = new Path2D();
		side.moveTo(b.x - rx, b.y);
		side.ellipse(b.x, b.y, rx, ry, 0, Math.PI, 0, true);
		side.lineTo(t.x + rx, t.y);
		side.lineTo(t.x - rx, t.y);
		side.closePath();
		ctx.fillStyle = colors.shade;
		ctx.fill(side);
		const sunScreenX = this.P(x + SUN_2D.x, y + SUN_2D.y, 0).x - b.x;
		ctx.save();
		ctx.clip(side);
		ctx.fillStyle = colors.lit;
		const w = rx * 1.05;
		if (sunScreenX < 0) ctx.fillRect(b.x - rx, t.y - ry, w, b.y - t.y + ry * 2);
		else ctx.fillRect(b.x + rx - w, t.y - ry, w, b.y - t.y + ry * 2);
		ctx.restore();
		ctx.lineWidth = ink;
		ctx.strokeStyle = INK;
		ctx.stroke(side);
		ctx.beginPath();
		ctx.ellipse(t.x, t.y, rx, ry, 0, 0, Math.PI * 2);
		ctx.fillStyle = colors.top;
		ctx.fill();
		ctx.stroke();
		return { b, t, rx, ry };
	}

	// ---------- Shadows (ground plane, meters) ----------

	private groundZ(track: Track, x: number, y: number): number {
		return track.heightAt(track.query({ x, y }).along);
	}

	private hullShadow(track: Track, points: Vec2[]) {
		const lifted = points.map((p) =>
			this.P(p.x, p.y, this.groundZ(track, p.x, p.y)),
		);
		const hull = convexHull(lifted);
		this.screenSpace();
		const ctx = this.ctx;
		ctx.fillStyle = C.shadow;
		ctx.beginPath();
		hull.forEach((p, i) =>
			i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
		);
		ctx.closePath();
		ctx.fill();
	}

	private columnShadow(
		track: Track,
		x: number,
		y: number,
		r: number,
		z0: number,
		z1: number,
	) {
		const ctx = this.ctx;
		const a = shadowOffset(z0);
		const b = shadowOffset(z1);
		const p0 = { x: x + a.x, y: y + a.y };
		const p1 = { x: x + b.x, y: y + b.y };
		const s0 = this.P(p0.x, p0.y, this.groundZ(track, p0.x, p0.y));
		const s1 = this.P(p1.x, p1.y, this.groundZ(track, p1.x, p1.y));
		this.screenSpace();
		ctx.strokeStyle = C.shadow;
		ctx.lineWidth = r * 2 * this.s;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(s0.x, s0.y);
		ctx.lineTo(s1.x, s1.y);
		ctx.stroke();
	}

	private obstacleShadow(track: Track, o: Obstacle) {
		switch (o.kind) {
			case "rock": {
				const base = this.rockBase(o);
				const h = this.rockHeight(o);
				this.hullShadow(track, [
					...base,
					...offset(shrink(base, 0.6), shadowOffset(h)),
				]);
				break;
			}
			case "cactus":
				this.columnShadow(track, o.x, o.y, o.r, 0, 2.1);
				for (const arm of this.cactusArms(o))
					this.columnShadow(track, arm.x, arm.y, arm.r, arm.z0, arm.z1);
				break;
			case "barrel":
				this.columnShadow(track, o.x, o.y, o.r, 0, 0.95);
				break;
			case "tires":
				for (const t of this.tireStacks(o))
					this.columnShadow(track, t.x, t.y, t.r, 0, t.count * 0.3);
				break;
		}
	}

	private carShadow(track: Track, car: VehicleSnapshot) {
		const toWorld = this.carToWorld(car);
		const body = CAR_OUTLINE.map((p) =>
			toWorld(scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b)),
		);
		const cab = shrink(CAB_OUTLINE, 0.9).map(toWorld);
		const tires = axleLayout(CAR_SPEC.a, CAR_SPEC.b).map((w) =>
			toWorld({ x: w.x, y: w.y + Math.sign(w.y) * 0.12 }),
		);
		this.hullShadow(track, [
			...body,
			...tires,
			...offset(body, shadowOffset(HOOD_TOP)),
			...offset(cab, shadowOffset(CAB_TOP)),
		]);
	}

	// ---------- Ground ----------

	private drawGround(
		track: Track,
		inView: (x: number, y: number, r: number) => boolean,
	) {
		const ctx = this.ctx;
		const dunes: Decor[] = [];
		const flat: Decor[] = [];
		for (const d of track.groundDecor) {
			if (!inView(d.x, d.y, d.r * 2.4)) continue;
			if (d.kind === "patch" && d.r > 5.5) dunes.push(d);
			else flat.push(d);
		}
		// Low sand dunes as extruded ellipses so the desert reads in 3D.
		for (const d of dunes) {
			const h = 0.35 + d.seed * 0.55;
			const rx = d.r;
			const ry = d.r * 0.55;
			const c = Math.cos(d.rot);
			const sn = Math.sin(d.rot);
			const oval = (k: number): Vec2[] => {
				const pts: Vec2[] = [];
				for (let i = 0; i < 10; i++) {
					const a = (i / 10) * Math.PI * 2;
					const lx = Math.cos(a) * rx * k;
					const ly = Math.sin(a) * ry * k;
					pts.push({
						x: d.x + lx * c - ly * sn,
						y: d.y + lx * sn + ly * c,
					});
				}
				return pts;
			};
			this.prism(
				oval(1),
				d.z,
				d.z + h,
				{
					top: d.seed < 0.5 ? C.patchLight : "#f0c484",
					lit: d.seed < 0.5 ? C.patchDark : C.patchLight,
					shade: "#b88448",
				},
				0.04,
				0.72,
			);
		}
		for (const d of flat) {
			this.planeAt(d.z);
			switch (d.kind) {
				case "patch":
					ctx.fillStyle = d.seed < 0.5 ? C.patchDark : C.patchLight;
					ctx.beginPath();
					ctx.ellipse(d.x, d.y, d.r, d.r * 0.55, d.rot, 0, Math.PI * 2);
					ctx.fill();
					break;
				case "pebble":
					this.cylinder(
						d.x,
						d.y,
						d.r,
						d.z,
						d.z + 0.12 + d.seed * 0.18,
						{ top: "#c6ad8b", lit: "#8d7458", shade: "#5c4a36" },
						0.04,
					);
					break;
				case "tuft":
					this.drawTuft3d(d);
					break;
				case "bones":
					this.drawBone(d);
					break;
				case "crack":
					ctx.save();
					ctx.translate(d.x, d.y);
					ctx.strokeStyle = "#9b6a39";
					ctx.lineWidth = 0.07;
					ctx.stroke(this.cached(d, () => this.crackPath(d)));
					ctx.restore();
					break;
				default:
					break;
			}
		}
	}

	/** Sparse grass blades with height so tufts cast a silhouette. */
	private drawTuft3d(d: Decor) {
		const rand = mulberry32(Math.floor(d.seed * 1e9));
		const blades = 4 + Math.floor(rand() * 3);
		for (let i = 0; i < blades; i++) {
			const a = d.rot + (i / blades) * Math.PI * 2 + rand() * 0.45;
			const len = d.r * (1.1 + rand());
			const tipX = d.x + Math.cos(a) * len;
			const tipY = d.y + Math.sin(a) * len;
			const h = 0.25 + rand() * 0.45;
			const n = { x: -Math.sin(a) * 0.04, y: Math.cos(a) * 0.04 };
			this.prism(
				[
					{ x: d.x + n.x, y: d.y + n.y },
					{ x: tipX + n.x, y: tipY + n.y },
					{ x: tipX - n.x, y: tipY - n.y },
					{ x: d.x - n.x, y: d.y - n.y },
				],
				d.z,
				d.z + h,
				{ top: "#8a9a3a", lit: "#6e7f2c", shade: "#3f4a18" },
				0.03,
				0.35,
			);
		}
	}

	private crackPath(d: Decor): Path2D {
		const rand = mulberry32(Math.floor(d.seed * 1e9));
		const p = new Path2D();
		let x = 0;
		let y = 0;
		let a = d.rot;
		p.moveTo(0, 0);
		const steps = 5 + Math.floor(rand() * 4);
		for (let i = 0; i < steps; i++) {
			a += (rand() - 0.5) * 1.1;
			const len = (d.r / steps) * (0.6 + rand() * 0.8);
			x += Math.cos(a) * len;
			y += Math.sin(a) * len;
			p.lineTo(x, y);
			if (rand() < 0.3) {
				const b = a + (rand() < 0.5 ? 0.9 : -0.9);
				p.moveTo(x, y);
				p.lineTo(x + Math.cos(b) * len * 0.7, y + Math.sin(b) * len * 0.7);
				p.moveTo(x, y);
			}
		}
		return p;
	}

	private drawBone(d: Decor) {
		const ctx = this.ctx;
		const len = d.r * 2.2;
		const dx = Math.cos(d.rot) * len * 0.5;
		const dy = Math.sin(d.rot) * len * 0.5;
		const knob = d.r * 0.32;
		const shape = new Path2D();
		shape.arc(d.x - dx, d.y - dy, knob, 0, Math.PI * 2);
		shape.moveTo(d.x + dx + knob, d.y + dy);
		shape.arc(d.x + dx, d.y + dy, knob, 0, Math.PI * 2);
		ctx.lineWidth = d.r * 0.45 + 0.1;
		ctx.strokeStyle = INK;
		ctx.beginPath();
		ctx.moveTo(d.x - dx, d.y - dy);
		ctx.lineTo(d.x + dx, d.y + dy);
		ctx.stroke();
		ctx.lineWidth = 0.08;
		ctx.stroke(shape);
		ctx.fillStyle = "#efe6d2";
		ctx.fill(shape);
		ctx.lineWidth = d.r * 0.45;
		ctx.strokeStyle = "#efe6d2";
		ctx.beginPath();
		ctx.moveTo(d.x - dx, d.y - dy);
		ctx.lineTo(d.x + dx, d.y + dy);
		ctx.stroke();
	}

	private roadSamples(track: Track): { z: number; along: number }[] {
		const samples: { z: number; along: number }[] = [];
		let along = 0;
		const n = track.centerline.length;
		for (let i = 0; i < n; i++) {
			samples.push({ z: track.heightAt(along), along });
			if (i < n - 1) {
				const a = track.centerline[i];
				const b = track.centerline[i + 1];
				along += Math.hypot(b.x - a.x, b.y - a.y);
			}
		}
		return samples;
	}

	private widen(center: Vec2, edge: Vec2, extra: number): Vec2 {
		const dx = edge.x - center.x;
		const dy = edge.y - center.y;
		const len = Math.hypot(dx, dy) || 1;
		return { x: edge.x + (dx / len) * extra, y: edge.y + (dy / len) * extra };
	}

	/** Screen-space ribbon so each cross-section sits on the local road height. */
	private drawRoad(
		track: Track,
		inView: (x: number, y: number, r: number, h?: number) => boolean,
	) {
		const samples = this.roadSamples(track);
		const z = samples.map((s) => s.z);
		const n = track.centerline.length;
		const W = track.roadWidth;
		const points = samples.map((s) => track.pointAt(s.along));
		const normals = points.map((p) => p.n);
		const tangents = points.map((p) => ({
			x: Math.cos(p.angle),
			y: Math.sin(p.angle),
		}));
		const banks = samples.map((s) => track.bankAt(s.along));
		const grades = samples.map((s) => track.gradeAt(s.along));
		const lateral = (i: number, edge: Vec2) => {
			const c = track.centerline[i];
			const normal = normals[i];
			return (edge.x - c.x) * normal.x + (edge.y - c.y) * normal.y;
		};
		const zAt = (i: number, edge: Vec2) =>
			bankedHeight(z[i], banks[i], lateral(i, edge));
		const visible = (i: number) => {
			const c = track.centerline[i];
			return inView(c.x, c.y, W, 4);
		};
		this.screenSpace();

		// Embankment + curb sidewalls first so the ribbon top paints over them.
		this.drawRoadSidewalls(track, zAt, visible, grades, normals);

		const band = (
			extra: number,
			colorFor: (i: number) => string,
			when?: (i: number) => boolean,
		) => {
			for (let i = 0; i < n - 1; i++) {
				if (when && !when(i) && !when(i + 1)) continue;
				if (!visible(i) && !visible(i + 1)) continue;
				const c0 = track.centerline[i];
				const c1 = track.centerline[i + 1];
				const l0 = this.widen(c0, track.leftEdge[i], extra);
				const r0 = this.widen(c0, track.rightEdge[i], extra);
				const l1 = this.widen(c1, track.leftEdge[i + 1], extra);
				const r1 = this.widen(c1, track.rightEdge[i + 1], extra);
				this.fillScreenPoly(
					[
						this.P(l0.x, l0.y, zAt(i, l0)),
						this.P(r0.x, r0.y, zAt(i, r0)),
						this.P(r1.x, r1.y, zAt(i + 1, r1)),
						this.P(l1.x, l1.y, zAt(i + 1, l1)),
					],
					colorFor(i),
					0,
				);
			}
		};
		band(0.7, () => INK);
		band(0.35, (i) => {
			const nrm = roadSurfaceNormal(
				grades[i],
				banks[i],
				tangents[i],
				normals[i],
			);
			return shoulderForLit(roadShadeScore(faceLit(nrm), grades[i], banks[i]));
		});
		band(0, (i) => {
			const nrm = roadSurfaceNormal(
				grades[i],
				banks[i],
				tangents[i],
				normals[i],
			);
			return asphaltForLit(roadShadeScore(faceLit(nrm), grades[i], banks[i]));
		});

		// Raised berms / cut banks that follow the ribbon height at each corner.
		for (let i = 0; i < n - 1; i += 2) {
			if (!visible(i) && !visible(i + 1)) continue;
			const absG = Math.abs(grades[i]);
			const bermH =
				track.archetype === "canyon"
					? 0.7 + absG * 5
					: track.archetype === "boulder"
						? 0.55 + absG * 3.2
						: absG > 0.025
							? 0.35 + absG * 2
							: 0;
			if (bermH < 0.25) continue;
			const i1 = Math.min(n - 1, i + 1);
			for (const edge of [track.leftEdge, track.rightEdge] as const) {
				const e0 = edge[i];
				const e1 = edge[i1];
				const c0 = track.centerline[i];
				const c1 = track.centerline[i1];
				const out0 = this.widen(c0, e0, 1.25);
				const out1 = this.widen(c1, e1, 1.25);
				const z0 = zAt(i, e0);
				const z1 = zAt(i1, e1);
				const base = Math.min(z0, z1) - ROAD_CURB * 0.35;
				this.prism(
					[e0, e1, out1, out0],
					base,
					base + bermH,
					{ top: "#c99458", lit: "#b07a42", shade: "#7a5230" },
					0.035,
					0.9,
					undefined,
					(idx) => {
						const edgeZ = idx < 2 ? (idx === 0 ? z0 : z1) : idx === 2 ? z1 : z0;
						return Math.max(0, edgeZ - base - bermH * 0.15);
					},
				);
			}
		}

		this.drawRoadGradeMarks(track, samples, zAt, visible, grades, banks);
		this.drawRampAndWash(track, samples, zAt, visible);

		const ctx = this.ctx;
		const chain = (
			pts: Vec2[],
			color: string,
			width: number,
			dash: number[],
			zOf: (i: number) => number,
		) => {
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
			ctx.setLineDash(dash);
			ctx.beginPath();
			for (let i = 0; i < n; i++) {
				const p = this.P(pts[i].x, pts[i].y, zOf(i));
				if (i === 0) ctx.moveTo(p.x, p.y);
				else ctx.lineTo(p.x, p.y);
			}
			ctx.stroke();
			ctx.setLineDash([]);
		};
		const edgeW = Math.max(1.5, 0.18 * this.s);
		chain(track.leftEdge, C.edgeLine, edgeW, [], (i) =>
			zAt(i, track.leftEdge[i]),
		);
		chain(track.rightEdge, C.edgeLine, edgeW, [], (i) =>
			zAt(i, track.rightEdge[i]),
		);
		chain(
			track.centerline,
			C.centerLine,
			Math.max(2, 0.24 * this.s),
			[12, 16],
			(i) => z[i],
		);

		this.planeAt(track.heightAt(track.startS));
		this.drawChecker(track.start, track.startAngle, W, 1);
		this.planeAt(track.heightAt(track.finishS));
		this.drawChecker(track.finish, track.finishAngle, W, 3);
	}

	/** Vertical curb / embankment faces so a grade reads as a tilting silhouette. */
	private drawRoadSidewalls(
		track: Track,
		zAt: (i: number, edge: Vec2) => number,
		visible: (i: number) => boolean,
		grades: number[],
		normals: Vec2[],
	) {
		const n = track.centerline.length;
		const wallColors = {
			lit: "#8a5a30",
			shade: "#5a381c",
			deep: "#2e1c10",
			lip: "#d2b48c",
		};
		for (let i = 0; i < n - 1; i++) {
			if (!visible(i) && !visible(i + 1)) continue;
			const absG = Math.abs(grades[i]);
			const centerZ = Math.abs(zAt(i, track.centerline[i]));
			const embank = embankDepth(track.archetype, absG, centerZ);
			const sides: { edge: Vec2[]; sign: number }[] = [
				{ edge: track.leftEdge, sign: -1 },
				{ edge: track.rightEdge, sign: 1 },
			];
			for (const side of sides) {
				const e0 = side.edge[i];
				const e1 = side.edge[i + 1];
				const top0 = zAt(i, e0);
				const top1 = zAt(i + 1, e1);
				const bot0 = top0 - embank;
				const bot1 = top1 - embank;
				const outward = {
					x: normals[i].x * side.sign,
					y: normals[i].y * side.sign,
				};
				const sunLit = outward.x * SUN_2D.x + outward.y * SUN_2D.y > 0.05;
				const base = sunLit ? wallColors.lit : wallColors.shade;
				const dz = Math.abs(top0 - top1);
				const fill = dz > 0.25 || absG > 0.03 ? wallColors.deep : base;
				// Ground contact shadow under the embankment.
				this.fillScreenPoly(
					[
						this.P(e0.x, e0.y, bot0 - 0.02),
						this.P(e1.x, e1.y, bot1 - 0.02),
						this.P(
							e1.x + outward.x * 0.55,
							e1.y + outward.y * 0.55,
							bot1 - 0.02,
						),
						this.P(
							e0.x + outward.x * 0.55,
							e0.y + outward.y * 0.55,
							bot0 - 0.02,
						),
					],
					"rgba(55, 22, 0, 0.35)",
					0,
				);
				this.fillScreenPoly(
					[
						this.P(e0.x, e0.y, bot0),
						this.P(e1.x, e1.y, bot1),
						this.P(e1.x, e1.y, top1),
						this.P(e0.x, e0.y, top0),
					],
					fill,
					Math.max(1, 0.07 * this.s),
				);
				// Light lip along the top edge so the tilt of the curb reads.
				const ctx = this.ctx;
				ctx.strokeStyle = wallColors.lip;
				ctx.lineWidth = Math.max(1.4, 0.11 * this.s);
				ctx.beginPath();
				const a = this.P(e0.x, e0.y, top0 + 0.02);
				const b = this.P(e1.x, e1.y, top1 + 0.02);
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
		}
	}

	/** Creases, contour stripes, and bank edge highlights on sloping ribbon. */
	private drawRoadGradeMarks(
		track: Track,
		samples: { z: number; along: number }[],
		zAt: (i: number, edge: Vec2) => number,
		visible: (i: number) => boolean,
		grades: number[],
		banks: number[],
	) {
		const n = track.centerline.length;
		const furniture = track.furniture;
		const crease = (i: number) => {
			const s = samples[i].along;
			const bump = furniture ? cosineBump(s, furniture.rampS, RAMP_HALF) : 0;
			return needsGradeCrease(Math.abs(grades[i]), bump);
		};
		const inset = (center: Vec2, edge: Vec2, t: number) => ({
			x: center.x + (edge.x - center.x) * t,
			y: center.y + (edge.y - center.y) * t,
		});
		for (let i = 0; i < n - 1; i++) {
			if (!crease(i) && !crease(i + 1)) continue;
			if (!visible(i) && !visible(i + 1)) continue;
			const c0 = track.centerline[i];
			const c1 = track.centerline[i + 1];
			const tint = gradeTint(Math.abs(grades[i]));
			const l0 = inset(c0, track.leftEdge[i], 0.22);
			const r0 = inset(c0, track.rightEdge[i], 0.22);
			const l1 = inset(c1, track.leftEdge[i + 1], 0.22);
			const r1 = inset(c1, track.rightEdge[i + 1], 0.22);
			this.fillScreenPoly(
				[
					this.P(l0.x, l0.y, zAt(i, l0) + 0.02),
					this.P(r0.x, r0.y, zAt(i, r0) + 0.02),
					this.P(r1.x, r1.y, zAt(i + 1, r1) + 0.02),
					this.P(l1.x, l1.y, zAt(i + 1, l1) + 0.02),
				],
				tint > 0.55 ? "#3f342c" : "#4e4338",
				0,
			);
			// Contour stripe across the ribbon so the climb/descent angle is readable.
			if (tint > 0.15) {
				const midL = {
					x: (l0.x + l1.x) * 0.5,
					y: (l0.y + l1.y) * 0.5,
				};
				const midR = {
					x: (r0.x + r1.x) * 0.5,
					y: (r0.y + r1.y) * 0.5,
				};
				const zm = (zAt(i, l0) + zAt(i + 1, l1)) * 0.5 + 0.04;
				const ctx = this.ctx;
				ctx.strokeStyle =
					grades[i] > 0
						? `rgba(210, 180, 130, ${0.35 + tint * 0.55})`
						: `rgba(40, 28, 18, ${0.4 + tint * 0.5})`;
				ctx.lineWidth = Math.max(1.6, 0.16 * this.s * (0.7 + tint));
				ctx.beginPath();
				const a = this.P(midL.x, midL.y, zm);
				const b = this.P(midR.x, midR.y, zm);
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
			// Uphill / downhill chevrons on the centerline — unmistakable grade cue.
			if (tint > 0.35 && i % 3 === 0) {
				const p = track.pointAt(samples[i].along);
				const t = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
				const n = p.n;
				// grade > 0 is downhill along +tangent — tip points uphill.
				const dir = grades[i] >= 0 ? -1 : 1;
				const tip = {
					x: p.p.x + t.x * 1.1 * dir,
					y: p.p.y + t.y * 1.1 * dir,
				};
				const left = {
					x: p.p.x - t.x * 0.35 * dir + n.x * 0.55,
					y: p.p.y - t.y * 0.35 * dir + n.y * 0.55,
				};
				const right = {
					x: p.p.x - t.x * 0.35 * dir - n.x * 0.55,
					y: p.p.y - t.y * 0.35 * dir - n.y * 0.55,
				};
				const zz = samples[i].z + 0.06;
				this.fillScreenPoly(
					[
						this.P(tip.x, tip.y, zz),
						this.P(left.x, left.y, zz),
						this.P(right.x, right.y, zz),
					],
					`rgba(255, 198, 58, ${0.4 + tint * 0.45})`,
					Math.max(0.8, 0.06 * this.s),
				);
			}
		}

		// High-edge highlight on banked bends (inside of the turn sits higher).
		for (let i = 0; i < n - 1; i++) {
			const bh = bankHighlight(Math.abs(banks[i]));
			if (bh < 0.2) continue;
			if (!visible(i) && !visible(i + 1)) continue;
			const highEdge = banks[i] >= 0 ? track.leftEdge : track.rightEdge;
			const lowEdge = banks[i] >= 0 ? track.rightEdge : track.leftEdge;
			const c0 = track.centerline[i];
			const c1 = track.centerline[i + 1];
			const hi0 = inset(c0, highEdge[i], 0.92);
			const hi1 = inset(c1, highEdge[i + 1], 0.92);
			const lo0 = inset(c0, highEdge[i], 0.72);
			const lo1 = inset(c1, highEdge[i + 1], 0.72);
			this.fillScreenPoly(
				[
					this.P(hi0.x, hi0.y, zAt(i, hi0) + 0.04),
					this.P(hi1.x, hi1.y, zAt(i + 1, hi1) + 0.04),
					this.P(lo1.x, lo1.y, zAt(i + 1, lo1) + 0.03),
					this.P(lo0.x, lo0.y, zAt(i, lo0) + 0.03),
				],
				`rgba(241, 228, 194, ${0.25 + bh * 0.35})`,
				0,
			);
			const d0 = inset(c0, lowEdge[i], 0.88);
			const d1 = inset(c1, lowEdge[i + 1], 0.88);
			const e0 = inset(c0, lowEdge[i], 0.68);
			const e1 = inset(c1, lowEdge[i + 1], 0.68);
			this.fillScreenPoly(
				[
					this.P(d0.x, d0.y, zAt(i, d0) + 0.02),
					this.P(d1.x, d1.y, zAt(i + 1, d1) + 0.02),
					this.P(e1.x, e1.y, zAt(i + 1, e1) + 0.02),
					this.P(e0.x, e0.y, zAt(i, e0) + 0.02),
				],
				`rgba(40, 28, 18, ${0.12 + bh * 0.28})`,
				0,
			);
		}
	}

	/** Explicit ramp wedge and wash bowl so furniture is not just a flat crease. */
	private drawRampAndWash(
		track: Track,
		samples: { z: number; along: number }[],
		zAt: (i: number, edge: Vec2) => number,
		visible: (i: number) => boolean,
	) {
		const furniture = track.furniture;
		if (!furniture) return;
		const n = track.centerline.length;
		for (let i = 0; i < n - 1; i++) {
			if (!visible(i) && !visible(i + 1)) continue;
			const s0 = samples[i].along;
			const s1 = samples[i + 1].along;
			const ramp0 = cosineBump(s0, furniture.rampS, RAMP_HALF);
			const ramp1 = cosineBump(s1, furniture.rampS, RAMP_HALF);
			const wash0 = cosineBump(s0, furniture.washS, WASH_HALF);
			const wash1 = cosineBump(s1, furniture.washS, WASH_HALF);
			const c0 = track.centerline[i];
			const l0 = track.leftEdge[i];
			const r0 = track.rightEdge[i];
			const l1 = track.leftEdge[i + 1];
			const r1 = track.rightEdge[i + 1];

			if (ramp0 > 0.08 || ramp1 > 0.08) {
				const lift = Math.max(ramp0, ramp1) * 0.35;
				this.fillScreenPoly(
					[
						this.P(l0.x, l0.y, zAt(i, l0) + lift * 0.15),
						this.P(r0.x, r0.y, zAt(i, r0) + lift * 0.15),
						this.P(r1.x, r1.y, zAt(i + 1, r1) + lift * 0.15),
						this.P(l1.x, l1.y, zAt(i + 1, l1) + lift * 0.15),
					],
					ramp0 > 0.7 || ramp1 > 0.7 ? "#6a5a48" : "#746454",
					0,
				);
				// Leading lip of the ramp — a thin raised bar across the ribbon.
				if (ramp0 > 0.55 && ramp0 >= ramp1) {
					const a = this.P(l0.x, l0.y, zAt(i, l0) + 0.12);
					const b = this.P(r0.x, r0.y, zAt(i, r0) + 0.12);
					const ctx = this.ctx;
					ctx.strokeStyle = "#d8c4a0";
					ctx.lineWidth = Math.max(2, 0.2 * this.s);
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.stroke();
				}
			}

			if (wash0 > 0.08 || wash1 > 0.08) {
				const sink = Math.max(wash0, wash1) * 0.2;
				this.fillScreenPoly(
					[
						this.P(l0.x, l0.y, zAt(i, l0) - sink),
						this.P(r0.x, r0.y, zAt(i, r0) - sink),
						this.P(r1.x, r1.y, zAt(i + 1, r1) - sink),
						this.P(l1.x, l1.y, zAt(i + 1, l1) - sink),
					],
					wash0 > 0.55 || wash1 > 0.55 ? "#5c4a38" : "#6a5644",
					0,
				);
				// Soft sand lips on the wash walls.
				if (wash0 > 0.35) {
					for (const edge of [l0, r0] as const) {
						const out = this.widen(c0, edge, 0.55);
						this.fillScreenPoly(
							[
								this.P(edge.x, edge.y, zAt(i, edge)),
								this.P(out.x, out.y, zAt(i, edge) - 0.15),
								this.P(out.x, out.y, zAt(i, edge) + 0.2),
								this.P(edge.x, edge.y, zAt(i, edge) + 0.08),
							],
							"#b88850",
							0,
						);
					}
				}
			}
		}
	}

	private drawChevron(track: Track, target: Vec2) {
		const q = track.query(target);
		const z = track.heightAt(q.along) + 0.25;
		const c = Math.cos(q.angle);
		const s = Math.sin(q.angle);
		this.planeAt(z);
		const ctx = this.ctx;
		ctx.fillStyle = "#ff4d2e";
		ctx.strokeStyle = INK;
		ctx.lineWidth = 0.12;
		ctx.beginPath();
		ctx.moveTo(target.x + c * 2.1, target.y + s * 2.1);
		ctx.lineTo(target.x - c * 0.3 - s * 0.85, target.y - s * 0.3 + c * 0.85);
		ctx.lineTo(target.x + c * 0.35, target.y + s * 0.35);
		ctx.lineTo(target.x - c * 0.3 + s * 0.85, target.y - s * 0.3 - c * 0.85);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}

	private drawChecker(p: Vec2, angle: number, width: number, rows: number) {
		const ctx = this.ctx;
		const cells = 12;
		const size = width / cells;
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.rotate(angle);
		for (let i = 0; i < cells; i++) {
			for (let j = 0; j < rows; j++) {
				ctx.fillStyle = (i + j) % 2 === 0 ? "#f5f0e6" : INK;
				ctx.fillRect((j - rows / 2) * size, -width / 2 + i * size, size, size);
			}
		}
		ctx.lineWidth = 0.1;
		ctx.strokeStyle = INK;
		ctx.strokeRect((-rows / 2) * size, -width / 2, rows * size, width);
		ctx.restore();
	}

	private drawRoadDecor(
		track: Track,
		inView: (x: number, y: number, r: number) => boolean,
	) {
		const ctx = this.ctx;
		for (const d of track.roadDecor) {
			if (!inView(d.x, d.y, d.r)) continue;
			this.planeAt(d.z);
			if (d.kind === "oil") {
				ctx.fillStyle = C.oil;
				ctx.beginPath();
				ctx.ellipse(d.x, d.y, d.r * 0.8, d.r * 0.5, d.rot, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.save();
				ctx.translate(d.x, d.y);
				ctx.strokeStyle = C.roadCrack;
				ctx.lineWidth = 0.09;
				ctx.stroke(this.cached(d, () => this.crackPath(d)));
				ctx.restore();
			}
		}
	}

	private drawSplats(
		particles: ParticlePool,
		inView: (x: number, y: number, r: number) => boolean,
	) {
		const ctx = this.ctx;
		const blobs: {
			path: Path2D;
			x: number;
			y: number;
			r: number;
			z: number;
			fade: number;
		}[] = [];
		for (const s of particles.splats) {
			const fade = splatAlpha(s.life, SPLAT_LIFE);
			if (fade <= 0) continue;
			if (!inView(s.x, s.y, s.r * 1.5)) continue;
			const r = s.r * Math.min(1, fade);
			const path = new Path2D();
			path.arc(s.x, s.y, r, 0, Math.PI * 2);
			const rand = mulberry32(Math.floor(s.seed * 1e9));
			for (let k = 0; k < 3; k++) {
				const ang = rand() * Math.PI * 2;
				const rr = r * (0.35 + rand() * 0.3);
				const cx = s.x + Math.cos(ang) * r * 0.95;
				const cy = s.y + Math.sin(ang) * r * 0.95;
				path.moveTo(cx + rr, cy);
				path.arc(cx, cy, rr, 0, Math.PI * 2);
			}
			blobs.push({ path, x: s.x, y: s.y, r, z: s.z, fade });
		}
		// Stroke everything first, then fill over it: overlapping puddles merge into one inked outline.
		ctx.lineWidth = 0.16;
		ctx.strokeStyle = rgb(C.liquidDeep);
		for (const b of blobs) {
			this.planeAt(b.z);
			ctx.globalAlpha = b.fade;
			ctx.strokeStyle = rgb(C.liquidDeep);
			ctx.lineWidth = 0.16;
			ctx.stroke(b.path);
		}
		for (const b of blobs) {
			this.planeAt(b.z);
			ctx.globalAlpha = b.fade;
			ctx.fillStyle = rgb(C.liquidMid);
			ctx.fill(b.path);
		}
		ctx.fillStyle = rgb(C.liquidLight);
		for (const b of blobs) {
			this.planeAt(b.z);
			ctx.globalAlpha = b.fade;
			ctx.beginPath();
			ctx.ellipse(
				b.x + SUN_2D.x * b.r * 0.4,
				b.y + SUN_2D.y * b.r * 0.4,
				b.r * 0.35,
				b.r * 0.16,
				Math.atan2(SUN_2D.y, SUN_2D.x) + Math.PI / 2,
				0,
				Math.PI * 2,
			);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	private drawSkids(particles: ParticlePool) {
		const ctx = this.ctx;
		ctx.lineWidth = 0.28;
		for (const k of particles.skids) {
			const a = skidAlpha(k.life, SKID_LIFE, k.strength);
			if (a < 0.05) continue;
			this.planeAt(k.z);
			ctx.strokeStyle = `rgba(42, 29, 20, ${a * 0.6})`;
			ctx.beginPath();
			ctx.moveTo(k.x1, k.y1);
			ctx.lineTo(k.x2, k.y2);
			ctx.stroke();
		}
	}

	// ---------- Props ----------

	private rockBase(o: Obstacle): Vec2[] {
		return o.shape.map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
	}

	private rockHeight(o: Obstacle): number {
		return rockDrawHeight(o.r, o.rot);
	}

	private cactusArms(o: Obstacle) {
		const arms = [o.rot, o.rot + 2.4];
		if (o.rot > Math.PI) arms.push(o.rot + 4.2);
		return arms.map((a, k) => ({
			a,
			x: o.x + Math.cos(a) * o.r * 1.6,
			y: o.y + Math.sin(a) * o.r * 1.6,
			r: o.r * 0.55,
			z0: 0.7 + k * 0.25,
			z1: 1.55 + k * 0.2,
		}));
	}

	private tireStacks(o: Obstacle) {
		return [0, 1, 2].map((k) => {
			const a = o.rot + k * 2.1;
			return {
				x: o.x + Math.cos(a) * o.r * 0.55,
				y: o.y + Math.sin(a) * o.r * 0.55,
				r: o.r * 0.62,
				count: 3 - k,
			};
		});
	}

	private drawObstacle(o: Obstacle) {
		switch (o.kind) {
			case "rock": {
				const base = this.rockBase(o);
				const h = this.rockHeight(o);
				const colors = { top: C.rock, lit: C.rock, shade: C.rockShade };
				this.prism(base, o.z, o.z + h * 0.55, colors, 0.09, 1.1);
				this.prism(
					shrink(base, 0.82),
					o.z + h * 0.35,
					o.z + h * 0.82,
					colors,
					0.08,
					0.7,
				);
				this.prism(
					shrink(base, 0.62),
					o.z + h * 0.55,
					o.z + h,
					{ ...colors, top: C.rockTop },
					0.07,
					0.48,
					() => {
						const ctx = this.ctx;
						const c = centroid(base);
						const tip = o.shape[0] ?? { x: o.r, y: 0 };
						ctx.strokeStyle = INK;
						ctx.lineWidth = 0.05;
						ctx.beginPath();
						ctx.moveTo(c.x - tip.x * 0.15, c.y - tip.y * 0.15);
						ctx.lineTo(c.x + tip.x * 0.45, c.y + tip.y * 0.45);
						ctx.stroke();
						ctx.beginPath();
						ctx.moveTo(c.x + tip.y * 0.2, c.y - tip.x * 0.2);
						ctx.lineTo(c.x - tip.y * 0.35, c.y + tip.x * 0.35);
						ctx.stroke();
					},
				);
				break;
			}
			case "cactus":
				this.drawCactus(o);
				break;
			case "barrel":
				this.drawBarrel(o);
				break;
			case "tires":
				this.drawTires(o);
				break;
		}
	}

	private drawCactus(o: Obstacle) {
		const ctx = this.ctx;
		const colors = { top: C.cactusTop, lit: C.cactus, shade: C.cactusShade };
		const parts: Solid[] = [];
		for (const arm of this.cactusArms(o)) {
			parts.push({
				depth: arm.x + arm.y,
				draw: () => {
					const dir = { x: Math.cos(arm.a), y: Math.sin(arm.a) };
					const n = { x: -dir.y * arm.r * 0.8, y: dir.x * arm.r * 0.8 };
					const reach = o.r * 1.6;
					this.prism(
						[
							{ x: o.x + n.x, y: o.y + n.y },
							{ x: o.x + dir.x * reach + n.x, y: o.y + dir.y * reach + n.y },
							{ x: o.x + dir.x * reach - n.x, y: o.y + dir.y * reach - n.y },
							{ x: o.x - n.x, y: o.y - n.y },
						],
						o.z + arm.z0 - 0.05,
						o.z + arm.z0 + arm.r * 1.4,
						colors,
						0.08,
					);
					this.cylinder(
						arm.x,
						arm.y,
						arm.r,
						o.z + arm.z0,
						o.z + arm.z1,
						colors,
						0.08,
					);
				},
			});
		}
		parts.push({
			depth: o.x + o.y,
			draw: () => {
				const { b, t, rx } = this.cylinder(
					o.x,
					o.y,
					o.r,
					o.z,
					o.z + 2.1,
					colors,
					0.1,
				);
				ctx.strokeStyle = "rgba(27, 18, 11, 0.6)";
				ctx.lineWidth = 0.035 * this.s;
				ctx.beginPath();
				for (const k of [-0.55, 0, 0.55]) {
					const sag = Math.sqrt(1 - k * k) * rx * 0.58;
					ctx.moveTo(b.x + k * rx, b.y + sag);
					ctx.lineTo(t.x + k * rx, t.y + sag);
				}
				ctx.stroke();
				ctx.strokeStyle = "rgba(27, 18, 11, 0.85)";
				ctx.lineWidth = 0.02 * this.s;
				for (let k = 0; k < 5; k++) {
					const p = this.P(o.x, o.y, o.z + 0.35 + k * 0.32);
					const dir = k % 2 === 0 ? 1 : -1;
					ctx.beginPath();
					ctx.moveTo(p.x, p.y);
					ctx.lineTo(p.x + dir * rx * 0.7, p.y - 3);
					ctx.stroke();
				}
				if (o.rot < 1.2) {
					ctx.beginPath();
					ctx.arc(t.x, t.y, o.r * 0.32 * this.s, 0, Math.PI * 2);
					ctx.fillStyle = "#ff6fb0";
					ctx.fill();
					ctx.lineWidth = 0.05 * this.s;
					ctx.strokeStyle = INK;
					ctx.stroke();
				}
			},
		});
		parts.sort((a, b) => a.depth - b.depth);
		for (const p of parts) p.draw();
	}

	private drawBarrel(o: Obstacle) {
		const ctx = this.ctx;
		const h = o.z + 0.95;
		const { rx, ry } = this.cylinder(
			o.x,
			o.y,
			o.r,
			o.z,
			h - 0.08,
			{ top: C.barrel, lit: C.barrel, shade: C.barrelShade },
			0.1,
		);
		this.cylinder(
			o.x,
			o.y,
			o.r * 1.08,
			h - 0.08,
			h,
			{ top: "#e25848", lit: C.barrel, shade: C.barrelShade },
			0.06,
		);
		ctx.lineWidth = 0.09 * this.s;
		ctx.strokeStyle = C.barrelBand;
		for (const z of [o.z + 0.28, o.z + 0.68]) {
			const c = this.P(o.x, o.y, z);
			ctx.beginPath();
			ctx.ellipse(c.x, c.y, rx * 0.98, ry * 0.98, 0, 0.05, Math.PI - 0.05);
			ctx.stroke();
		}
		this.planeAt(h);
		ctx.lineWidth = 0.05;
		ctx.strokeStyle = INK;
		ctx.beginPath();
		ctx.arc(o.x, o.y, o.r * 0.7, 0, Math.PI * 2);
		ctx.stroke();
		this.cel(
			circlePath(
				o.x + Math.cos(o.rot) * o.r * 0.38,
				o.y + Math.sin(o.rot) * o.r * 0.38,
				o.r * 0.13,
			),
			"#3b3b3b",
			"#6d6d6d",
			-0.02,
			-0.02,
			0.04,
		);
		this.screenSpace();
	}

	private drawTires(o: Obstacle) {
		const ctx = this.ctx;
		const stacks = this.tireStacks(o).sort((a, b) => a.x + a.y - (b.x + b.y));
		const tireH = 0.3;
		for (const t of stacks) {
			for (let k = 0; k < t.count; k++) {
				this.cylinder(
					t.x,
					t.y,
					t.r,
					o.z + k * tireH,
					o.z + (k + 1) * tireH - 0.03,
					{ top: C.tire, lit: C.tire, shade: C.tireShade },
					0.08,
				);
			}
			const topZ = o.z + t.count * tireH - 0.03;
			this.planeAt(topZ);
			ctx.fillStyle = "#4a3422";
			ctx.beginPath();
			ctx.arc(t.x, t.y, t.r * 0.45, 0, Math.PI * 2);
			ctx.fill();
			ctx.lineWidth = 0.05;
			ctx.strokeStyle = INK;
			ctx.stroke();
			this.screenSpace();
			this.cylinder(
				t.x,
				t.y,
				t.r * 0.22,
				topZ,
				topZ + 0.05,
				{ top: "#d9d3c7", lit: "#9a9a9a", shade: "#555" },
				0.04,
			);
		}
	}

	private flagPositions(track: Track): Vec2[] {
		const { finish, finishAngle, roadWidth } = track;
		const n = { x: -Math.sin(finishAngle), y: Math.cos(finishAngle) };
		return [-1, 1].map((side) => ({
			x: finish.x + n.x * (roadWidth / 2 + 1.3) * side,
			y: finish.y + n.y * (roadWidth / 2 + 1.3) * side,
		}));
	}

	private flagShadows(track: Track) {
		for (const p of this.flagPositions(track))
			this.columnShadow(track, p.x, p.y, 0.1, 0, 2.8);
	}

	private drawFlag(p: Vec2, angle: number, groundZ: number) {
		const ctx = this.ctx;
		const s = this.s;
		const poleTop = groundZ + FLAG_DRAW_HEIGHT;
		this.cylinder(
			p.x,
			p.y,
			0.25,
			groundZ,
			groundZ + 0.18,
			{
				top: "#9a9a9a",
				lit: "#9a9a9a",
				shade: "#555",
			},
			0.06,
		);
		const a = this.P(p.x, p.y, groundZ + 0.18);
		const b = this.P(p.x, p.y, poleTop);
		ctx.lineCap = "round";
		ctx.strokeStyle = INK;
		ctx.lineWidth = 0.16 * s;
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.stroke();
		ctx.strokeStyle = "#d8d2c4";
		ctx.lineWidth = 0.07 * s;
		ctx.stroke();
		const tip = this.P(p.x, p.y, poleTop);
		ctx.beginPath();
		ctx.arc(tip.x, tip.y, 0.09 * s, 0, Math.PI * 2);
		ctx.fillStyle = "#c9c1b5";
		ctx.fill();
		ctx.lineWidth = 0.05 * s;
		ctx.strokeStyle = INK;
		ctx.stroke();
		const back = { x: -Math.cos(angle) * 1.5, y: -Math.sin(angle) * 1.5 };
		const hoistTop = this.P(p.x, p.y, poleTop - 0.06);
		const hoistBot = this.P(p.x, p.y, poleTop - 0.86);
		const fly = this.P(p.x + back.x, p.y + back.y, poleTop - 0.42);
		this.fillScreenPoly([hoistTop, fly, hoistBot], "#ef4b33", 0.07 * s);
		this.fillScreenPoly(
			[
				hoistTop,
				this.P(p.x + back.x * 0.55, p.y + back.y * 0.55, poleTop - 0.28),
				this.P(p.x, p.y, poleTop - 0.3),
			],
			"#f7ecd2",
			0,
		);
	}

	// ---------- Car ----------

	private carToWorld(car: VehicleSnapshot) {
		const c = Math.cos(car.angle);
		const sn = Math.sin(car.angle);
		return (l: Vec2): Vec2 => ({
			x: car.pos.x + l.x * c - l.y * sn,
			y: car.pos.y + l.x * sn + l.y * c,
		});
	}

	private drawGhost(car: VehicleSnapshot, fluid: FluidLayer) {
		const W = this.canvas.width;
		const H = this.canvas.height;
		if (!this.ghostCanvas) this.ghostCanvas = document.createElement("canvas");
		const g = this.ghostCanvas;
		if (g.width !== W || g.height !== H) {
			g.width = W;
			g.height = H;
		}
		const gctx = g.getContext("2d");
		if (!gctx) return;
		gctx.setTransform(1, 0, 0, 1, 0, 0);
		gctx.clearRect(0, 0, W, H);
		gctx.lineJoin = "round";
		this.ctx = gctx;
		try {
			this.drawCar(car, fluid);
		} finally {
			this.ctx = this.mainCtx;
		}
		this.screenSpace();
		this.ctx.save();
		this.ctx.globalAlpha = 0.38;
		this.ctx.drawImage(g, 0, 0);
		this.ctx.restore();
	}

	private drawCar(car: VehicleSnapshot, fluid: FluidLayer) {
		const toWorld = this.carToWorld(car);
		const light = rotate(SUN_2D, -car.angle);
		const toward = rotate({ x: 1, y: 1 }, -car.angle);
		const bodyColors = { top: C.body, lit: C.body, shade: C.bodyShade };
		const depthAt = (x: number, y: number) => {
			const w = toWorld({ x, y });
			return w.x + w.y;
		};

		const axles = axleLayout(CAR_SPEC.a, CAR_SPEC.b);
		const wheels = axles
			.map((w) => ({
				x: w.x,
				y: w.y,
				steer: w.steer ? car.steerAngle : 0,
			}))
			.sort((a, b) => depthAt(a.x, a.y) - depthAt(b.x, b.y));
		for (const w of wheels) this.drawTire(car, w.x, w.y, w.steer);

		const body = CAR_OUTLINE.map((p) =>
			scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b),
		);
		this.prism(
			body.map(toWorld),
			car.z + BODY_BOTTOM,
			car.z + BED_TOP,
			bodyColors,
			0.12,
			1,
			() => this.drawBedTop(car, light),
			(i) => -body[i].x * car.pitch,
		);
		const hood = [
			{ x: 2.16, y: -0.58 },
			{ x: 2.16, y: 0.58 },
			{ x: 0.9, y: 0.74 },
			{ x: 0.9, y: -0.74 },
		].map((p) => scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b));
		this.prism(
			hood.map(toWorld),
			car.z + BED_TOP,
			car.z + HOOD_TOP,
			bodyColors,
			0.08,
			0.9,
			() => this.drawHoodCap(car, light),
			(i) => -hood[i].x * car.pitch,
		);
		const bumper = [
			{ x: 2.18, y: -0.7 },
			{ x: 2.4, y: -0.64 },
			{ x: 2.4, y: 0.64 },
			{ x: 2.18, y: 0.7 },
		].map((p) => scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b));
		this.prism(
			bumper.map(toWorld),
			car.z + 0.22,
			car.z + 0.46,
			{ top: "#4b4b4b", lit: "#5a5a5a", shade: "#262626" },
			0.05,
			1,
			undefined,
			(i) => -bumper[i].x * car.pitch,
		);
		for (const y of [-0.16, 0, 0.16]) {
			const bar = [
				{ x: 2.14, y: y - 0.045 },
				{ x: 2.24, y: y - 0.045 },
				{ x: 2.24, y: y + 0.045 },
				{ x: 2.14, y: y + 0.045 },
			].map((p) => scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b));
			this.prism(
				bar.map(toWorld),
				car.z + 0.5,
				car.z + 0.78,
				{ top: "#2a1d14", lit: "#3a322c", shade: "#1a120e" },
				0.03,
				1,
				undefined,
				(i) => -bar[i].x * car.pitch,
			);
		}
		for (const side of [-1, 1]) {
			const lampLocal = scaledBodyPoint(
				{ x: 2.18, y: side * 0.5 },
				CAR_SPEC.a,
				CAR_SPEC.b,
			);
			const lamp = toWorld(lampLocal);
			const nose = -lampLocal.x * car.pitch;
			this.cylinder(
				lamp.x,
				lamp.y,
				0.11,
				car.z + 0.52 + nose,
				car.z + 0.76 + nose,
				{
					top: "#fff6c2",
					lit: "#ffe27a",
					shade: "#c9a24a",
				},
				0.04,
			);
			const tailLocal = scaledBodyPoint(
				{ x: -2.22, y: side * 0.55 },
				CAR_SPEC.a,
				CAR_SPEC.b,
			);
			const tail = toWorld(tailLocal);
			const tailPitch = -tailLocal.x * car.pitch;
			this.cylinder(
				tail.x,
				tail.y,
				0.08,
				car.z + 0.48 + tailPitch,
				car.z + 0.66 + tailPitch,
				{
					top: "#ff6a55",
					lit: "#ff3b2f",
					shade: "#8c2219",
				},
				0.04,
			);
			// Side mirror
			const mirrorLocal = scaledBodyPoint(
				{ x: 0.92, y: side * 0.92 },
				CAR_SPEC.a,
				CAR_SPEC.b,
			);
			const mirror = toWorld(mirrorLocal);
			const mPitch = -mirrorLocal.x * car.pitch;
			this.cylinder(
				mirror.x,
				mirror.y,
				0.07,
				car.z + BED_TOP + 0.35 + mPitch,
				car.z + BED_TOP + 0.62 + mPitch,
				{ top: "#3a322c", lit: "#5a5248", shade: "#1f1812" },
				0.03,
			);
			this.cylinder(
				mirror.x,
				mirror.y,
				0.11,
				car.z + BED_TOP + 0.52 + mPitch,
				car.z + BED_TOP + 0.68 + mPitch,
				{ top: "#9ad4e0", lit: C.glass, shade: C.glassShade },
				0.025,
			);
			// Running board / rock rail
			const board = [
				{ x: -0.55, y: side * 0.9 },
				{ x: 1.05, y: side * 0.9 },
				{ x: 1.05, y: side * 1.02 },
				{ x: -0.55, y: side * 1.02 },
			].map((p) => scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b));
			this.prism(
				board.map(toWorld),
				car.z + 0.28,
				car.z + 0.42,
				{ top: "#3a322c", lit: "#4a4036", shade: "#1c1510" },
				0.04,
				1,
				undefined,
				(i) => -board[i].x * car.pitch,
			);
			// Mud flap behind rear axle
			const flap = [
				{ x: -CAR_SPEC.b - 0.35, y: side * 0.55 },
				{ x: -CAR_SPEC.b - 0.12, y: side * 0.55 },
				{ x: -CAR_SPEC.b - 0.12, y: side * 0.82 },
				{ x: -CAR_SPEC.b - 0.35, y: side * 0.82 },
			].map((p) => scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b));
			this.prism(
				flap.map(toWorld),
				car.z + 0.18,
				car.z + 0.55,
				{ top: "#2a1d14", lit: "#3a2820", shade: "#140e0a" },
				0.035,
				1,
				undefined,
				(i) => -flap[i].x * car.pitch,
			);
		}

		// Exhaust tip under the bed
		const exhaustLocal = scaledBodyPoint(
			{ x: -2.05, y: 0.55 },
			CAR_SPEC.a,
			CAR_SPEC.b,
		);
		const exhaust = toWorld(exhaustLocal);
		const exPitch = -exhaustLocal.x * car.pitch;
		this.cylinder(
			exhaust.x,
			exhaust.y,
			0.06,
			car.z + 0.22 + exPitch,
			car.z + 0.34 + exPitch,
			{ top: "#8a8478", lit: "#6a6458", shade: "#2e2a24" },
			0.03,
		);

		// Cab light bar
		const lightBar = [
			{ x: 0.05, y: -0.42 },
			{ x: 0.05, y: 0.42 },
			{ x: 0.22, y: 0.42 },
			{ x: 0.22, y: -0.42 },
		].map((p) => scaledBodyPoint(p, CAR_SPEC.a, CAR_SPEC.b));
		this.prism(
			lightBar.map(toWorld),
			car.z + CAB_TOP,
			car.z + CAB_TOP + 0.12,
			{ top: "#2a1d14", lit: "#3a322c", shade: "#15100c" },
			0.04,
			1,
			undefined,
			(i) => -lightBar[i].x * car.pitch,
		);
		for (const y of [-0.28, 0, 0.28]) {
			const beaconLocal = scaledBodyPoint(
				{ x: 0.14, y },
				CAR_SPEC.a,
				CAR_SPEC.b,
			);
			const beacon = toWorld(beaconLocal);
			const bPitch = -beaconLocal.x * car.pitch;
			this.cylinder(
				beacon.x,
				beacon.y,
				0.06,
				car.z + CAB_TOP + 0.08 + bPitch,
				car.z + CAB_TOP + 0.2 + bPitch,
				{ top: "#ffe27a", lit: "#ffc451", shade: "#c9a24a" },
				0.02,
			);
		}

		const metal = { top: "#c9c1b5", lit: "#7a736a", shade: "#4a453f" };
		const rails: { depth: number; draw: () => void }[] = [
			[
				{ x: -2.2, y: -0.82 },
				{ x: -2.02, y: -0.82 },
				{ x: -2.02, y: 0.82 },
				{ x: -2.2, y: 0.82 },
			],
			[
				{ x: -2.08, y: 0.7 },
				{ x: -0.76, y: 0.7 },
				{ x: -0.76, y: 0.88 },
				{ x: -2.08, y: 0.88 },
			],
			[
				{ x: -2.08, y: -0.88 },
				{ x: -0.76, y: -0.88 },
				{ x: -0.76, y: -0.7 },
				{ x: -2.08, y: -0.7 },
			],
		].map((shape) => ({
			depth: depthAt(
				shape.reduce((s, p) => s + p.x, 0) / shape.length,
				shape.reduce((s, p) => s + p.y, 0) / shape.length,
			),
			draw: () =>
				this.prism(
					shape.map(toWorld),
					car.z + BED_TOP,
					car.z + RAIL_TOP,
					metal,
					0.06,
				),
		}));
		const parts: Solid[] = [
			...rails,
			{
				depth: depthAt(-1.35, 0),
				draw: () => this.drawTub(car, fluid, toward),
			},
			{
				depth: depthAt(0.17, 0),
				draw: () => {
					this.prism(
						CAB_OUTLINE.map(toWorld),
						car.z + BED_TOP,
						car.z + CAB_TOP,
						bodyColors,
						0.1,
						0.9,
						() => this.drawRoof(car, light),
						(i) => -CAB_OUTLINE[i].x * car.pitch,
					);
					this.drawWindows(car);
				},
			},
		];
		parts.sort((a, b) => a.depth - b.depth);
		for (const part of parts) part.draw();
	}

	/** Round tire on the road height. The near sidewall carries a mark that rolls with distance. */
	private drawTire(
		car: VehicleSnapshot,
		lx: number,
		ly: number,
		steer: number,
	) {
		const radius = 0.36;
		const half = 0.13;
		const spin = car.wheelAngle;
		const toWorld = this.carToWorld(car);
		const c = Math.cos(steer);
		const sn = Math.sin(steer);
		const ring = (side: number) => {
			const pts: Vec2[] = [];
			const steps = 12;
			for (let i = 0; i < steps; i++) {
				const a = (i / steps) * Math.PI * 2 + spin;
				const along = Math.cos(a) * radius;
				const lateral = half * side;
				const w = toWorld({
					x: lx + along * c - lateral * sn,
					y: ly + along * sn + lateral * c,
				});
				pts.push(this.P(w.x, w.y, car.z + radius + Math.sin(a) * radius));
			}
			return pts;
		};
		const outward = Math.sign(ly) || 1;
		const capCenter = (side: number) =>
			toWorld({
				x: lx - half * side * sn,
				y: ly + half * side * c,
			});
		const outer = capCenter(outward);
		const inner = capCenter(-outward);
		const outerNear = outer.x + outer.y >= inner.x + inner.y;
		const nearSide = outerNear ? outward : -outward;
		const near = ring(nearSide);
		const far = ring(-nearSide);
		this.fillScreenPoly(
			convexHull([...near, ...far]),
			"#1c1c1c",
			0.045 * this.s,
		);
		this.fillScreenPoly(near, "#333", 0.04 * this.s);
		this.fillScreenPoly(shrink(near, 0.42), "#d9d3c7", 0.03 * this.s);
		this.fillScreenPoly(shrink(near, 0.14), "#5c5c5c", 0);
		const markAlong = Math.cos(spin) * radius * 0.55;
		const markLat = half * nearSide;
		const markWorld = toWorld({
			x: lx + markAlong * c - markLat * sn,
			y: ly + markAlong * sn + markLat * c,
		});
		const mark = this.P(
			markWorld.x,
			markWorld.y,
			car.z + radius + Math.sin(spin) * radius,
		);
		const ctx = this.ctx;
		ctx.fillStyle = "#f4e7c5";
		ctx.beginPath();
		ctx.arc(mark.x, mark.y, Math.max(2, 0.07 * this.s), 0, Math.PI * 2);
		ctx.fill();
	}

	/** Dirt and the bed rim, on the body's top plane. */
	private drawBedTop(car: VehicleSnapshot, light: Vec2) {
		const ctx = this.ctx;
		ctx.translate(car.pos.x, car.pos.y);
		ctx.rotate(car.angle);
		ctx.save();
		ctx.clip(this.carPath);
		ctx.translate(light.x * 0.16, light.y * 0.16);
		ctx.fillStyle = "#ffd36a";
		ctx.globalAlpha = 0.4;
		ctx.fill(this.carPath);
		ctx.restore();
		ctx.fillStyle = "#8a4b1f";
		ctx.beginPath();
		ctx.ellipse(-1.55, -0.7, 0.18, 0.06, -0.2, 0, Math.PI * 2);
		ctx.fill();
		const t = car.trunkLocal;
		const rim = roundRectPath(
			t.minX - 0.1,
			t.minY - 0.1,
			t.maxX - t.minX + 0.2,
			t.maxY - t.minY + 0.2,
			0.12,
		);
		this.cel(rim, "#4a453f", "#7a736a", light.x * 0.05, light.y * 0.05, 0.08);
	}

	/** Stripes and the hood scoop, on the raised hood. */
	private drawHoodCap(car: VehicleSnapshot, light: Vec2) {
		const ctx = this.ctx;
		ctx.translate(car.pos.x, car.pos.y);
		ctx.rotate(car.angle);
		ctx.fillStyle = C.stripe;
		ctx.fillRect(0.95, -0.28, 1.15, 0.12);
		ctx.fillRect(0.95, 0.16, 1.15, 0.12);
		const scoop = roundRectPath(1.28, -0.2, 0.55, 0.4, 0.08);
		this.cel(scoop, "#2a1d14", "#4a3628", light.x * 0.04, light.y * 0.04, 0.05);
	}

	private drawRoof(car: VehicleSnapshot, light: Vec2) {
		const ctx = this.ctx;
		ctx.translate(car.pos.x, car.pos.y);
		ctx.rotate(car.angle);
		ctx.translate(light.x * 0.08, light.y * 0.08);
		ctx.fillStyle = "#ffc451";
		ctx.fillRect(-0.55, -0.62, 1.45, 1.24);
		ctx.translate(-light.x * 0.08, -light.y * 0.08);
		ctx.fillStyle = C.stripe;
		ctx.fillRect(-0.55, -0.28, 1.45, 0.12);
		ctx.fillRect(-0.55, 0.16, 1.45, 0.12);
	}

	/** Windshield, the camera-facing side glass, and the rear window. */
	private drawWindows(car: VehicleSnapshot) {
		const toWorld = this.carToWorld(car);
		const project = (x: number, y: number, z: number) => {
			const w = toWorld({ x, y });
			return this.P(w.x, w.y, car.z + z - x * car.pitch);
		};
		const glass = (
			pts: { x: number; y: number; z: number }[],
			fill: string,
		) => {
			this.fillScreenPoly(
				pts.map((p) => project(p.x, p.y, p.z)),
				fill,
				0.045 * this.s,
			);
		};
		const facing = (n: Vec2) => n.x + n.y;
		const front = rotate({ x: 1, y: 0 }, car.angle);
		if (facing(front) > 0.02) {
			glass(
				[
					{ x: 0.98, y: -0.52, z: BED_TOP + 0.14 },
					{ x: 0.98, y: 0.52, z: BED_TOP + 0.14 },
					{ x: 0.4, y: 0.38, z: CAB_TOP - 0.14 },
					{ x: 0.4, y: -0.38, z: CAB_TOP - 0.14 },
				],
				C.glass,
			);
			const ctx = this.ctx;
			const a = project(0.82, -0.28, BED_TOP + 0.55);
			const b = project(0.58, -0.1, CAB_TOP - 0.42);
			ctx.strokeStyle = "#f5ffff";
			ctx.lineWidth = 0.045 * this.s;
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();
		}
		const right = rotate({ x: 0, y: 1 }, car.angle);
		const side = facing(right) >= 0 ? 1 : -1;
		const sideNormal = side > 0 ? right : { x: -right.x, y: -right.y };
		if (facing(sideNormal) > 0.05) {
			glass(
				[
					{ x: 0.7, y: 0.64 * side, z: BED_TOP + 0.32 },
					{ x: -0.22, y: 0.64 * side, z: BED_TOP + 0.32 },
					{ x: -0.16, y: 0.54 * side, z: CAB_TOP - 0.36 },
					{ x: 0.46, y: 0.54 * side, z: CAB_TOP - 0.36 },
				],
				C.glass,
			);
		}
		if (facing({ x: -front.x, y: -front.y }) > 0.25) {
			glass(
				[
					{ x: -0.56, y: -0.4, z: BED_TOP + 0.4 },
					{ x: -0.56, y: 0.4, z: BED_TOP + 0.4 },
					{ x: -0.4, y: 0.3, z: CAB_TOP - 0.3 },
					{ x: -0.4, y: -0.3, z: CAB_TOP - 0.3 },
				],
				C.glassShade,
			);
		}
	}

	/** Open tub sunk into the bed: clip to the opening, then floor, far walls and liquid. */
	private drawTub(car: VehicleSnapshot, fluid: FluidLayer, toward: Vec2) {
		const ctx = this.ctx;
		const toWorld = this.carToWorld(car);
		const t = car.trunkLocal;
		const floorZ = car.z + BED_TOP - fluid.wallHeight;
		const project = (x: number, y: number, z: number) => {
			const w = toWorld({ x, y });
			const p = this.P(w.x, w.y, floorZ + z);
			return { sx: p.x, sy: p.y };
		};
		const opening = [
			{ x: t.minX, y: t.minY },
			{ x: t.maxX, y: t.minY },
			{ x: t.maxX, y: t.maxY },
			{ x: t.minX, y: t.maxY },
		].map((p) => project(p.x, p.y, fluid.wallHeight));
		ctx.save();
		ctx.beginPath();
		opening.forEach((p, i) =>
			i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy),
		);
		ctx.closePath();
		ctx.clip();
		const sunLocal = rotate(SUN, -car.angle);
		drawTubMesh(ctx, fluid, {
			toScreen: project,
			toward,
			light: { x: sunLocal.x, y: sunLocal.y, z: SUN.z },
			scale: this.s,
			nearWalls: false,
		});
		ctx.restore();
	}

	// ---------- Particles ----------

	private drawDropletShadows(particles: ParticlePool) {
		const ctx = this.ctx;
		ctx.fillStyle = "rgba(40, 25, 10, 0.18)";
		for (const d of particles.droplets) {
			this.planeAt(d.groundZ);
			ctx.fillStyle = "rgba(40, 25, 10, 0.18)";
			ctx.beginPath();
			ctx.ellipse(d.x, d.y, 0.14, 0.12, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = C.shadow;
	}

	private drawDroplets(particles: ParticlePool, fluid: FluidLayer) {
		const ctx = this.ctx;
		const drops = [...particles.droplets].sort(
			(a, b) => a.x + a.y + a.z - (b.x + b.y + b.z),
		);
		ctx.fillStyle = shiftHex("#aaf354", fluid.colorShift);
		ctx.strokeStyle = rgb(C.liquidDeep);
		ctx.lineWidth = Math.max(1, 0.03 * this.s);
		for (const d of drops) {
			const r = Math.max(0.1, Math.min(0.22, Math.cbrt(d.volume) * 1.1));
			const speed = Math.hypot(d.vx, d.vy, d.vz);
			const streak = speed < 0.5 ? 0 : Math.min(0.22, speed / 120);
			const head = this.P(d.x, d.y, d.z);
			ctx.beginPath();
			ctx.arc(head.x, head.y, r * this.s, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			if (streak > 0) {
				const tail = this.P(
					d.x - (d.vx / speed) * streak,
					d.y - (d.vy / speed) * streak,
					d.z - (d.vz / speed) * streak,
				);
				ctx.beginPath();
				ctx.moveTo(tail.x, tail.y);
				ctx.lineTo(head.x, head.y);
				ctx.lineWidth = Math.max(1.5, r * this.s * 0.65);
				ctx.stroke();
			}
		}
	}

	private drawPuffs(particles: ParticlePool) {
		const ctx = this.ctx;
		ctx.lineWidth = 0.06 * this.s;
		const puffs = [...particles.puffs].sort((a, b) => a.x + a.y - (b.x + b.y));
		for (const p of puffs) {
			const a = puffAlpha(p.life, p.maxLife);
			if (a <= 0) continue;
			const scale = puffScale(p.life, p.maxLife);
			const rise = (1 - a) * 0.8;
			const c = this.P(p.x, p.y, p.z + p.r + rise);
			const rad = p.r * this.s * scale;
			ctx.fillStyle = `rgba(232, 204, 150, ${a * 0.85})`;
			ctx.strokeStyle = `rgba(120, 88, 52, ${a})`;
			ctx.beginPath();
			ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(c.x + rad * 0.55, c.y - rad * 0.28, rad * 0.62, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
	}

	private drawPopups(particles: ParticlePool) {
		const ctx = this.ctx;
		const pr = this.pixelRatio;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		for (const p of particles.popups) {
			const maxLife = p.big ? 1.4 : 1.0;
			const t = 1 - p.life / maxLife;
			const screen = this.P(p.x, p.y, 2);
			const x = screen.x;
			const y = screen.y - popupRise(p.life, maxLife, 46 * pr);
			const size = (p.big ? 40 : 26) * pr * (t < 0.12 ? 0.6 + t * 3.3 : 1);
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(-0.08);
			ctx.globalAlpha = popupAlpha(p.life, maxLife);
			ctx.font = `${size}px Bangers, Impact, 'Arial Black', sans-serif`;
			ctx.lineWidth = 6 * pr;
			ctx.strokeStyle = INK;
			ctx.strokeText(p.text, 0, 0);
			ctx.fillStyle = p.big ? "#ff4d2e" : "#ffd23f";
			ctx.fillText(p.text, 0, 0);
			ctx.restore();
		}
		ctx.globalAlpha = 1;
	}

	private drawDebug(car: VehicleSnapshot, fluid: FluidLayer) {
		const ctx = this.ctx;
		ctx.lineWidth = 0.08;
		ctx.strokeStyle = "#2563eb";
		ctx.beginPath();
		ctx.moveTo(car.pos.x, car.pos.y);
		ctx.lineTo(car.pos.x + car.vel.x * 0.3, car.pos.y + car.vel.y * 0.3);
		ctx.stroke();
		const a = rotate(car.accelLocal, car.angle);
		ctx.strokeStyle = "#dc2626";
		ctx.beginPath();
		ctx.moveTo(car.pos.x, car.pos.y);
		ctx.lineTo(car.pos.x + a.x * 0.3, car.pos.y + a.y * 0.3);
		ctx.stroke();
		const com = rotate(fluid.centroidLocal(), car.angle);
		ctx.fillStyle = "#ff00aa";
		ctx.beginPath();
		ctx.arc(car.pos.x + com.x, car.pos.y + com.y, 0.12, 0, Math.PI * 2);
		ctx.fill();
	}
}
