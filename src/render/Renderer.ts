import { rotate, type Vec2 } from "../math/vec2";
import type { FluidLayer } from "../physics/FluidLayer";
import { type ParticlePool, SKID_LIFE, SPLAT_LIFE } from "../physics/Particles";
import { TRUNK_LIP_HEIGHT } from "../physics/trunkConstants";
import type { VehicleSnapshot } from "../physics/VehicleSimulation";
import {
	type Decor,
	mulberry32,
	type Obstacle,
	type Track,
} from "../world/Track";
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
const CAB_TOP = 1.6;
const WHEEL_TOP = 0.72;

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
		for (const o of obstacles) {
			this.planeAt(o.z);
			this.obstacleShadow(o);
		}
		const flagZ = f.track.heightAt(f.track.finishS);
		this.planeAt(flagZ);
		this.flagShadows(f.track);
		this.planeAt(f.car.z);
		this.carShadow(f.car);
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

	private hullShadow(points: Vec2[]) {
		const hull = convexHull(points);
		const ctx = this.ctx;
		ctx.beginPath();
		hull.forEach((p, i) =>
			i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
		);
		ctx.closePath();
		ctx.fill();
	}

	private columnShadow(
		x: number,
		y: number,
		r: number,
		z0: number,
		z1: number,
	) {
		const ctx = this.ctx;
		const a = shadowOffset(z0);
		const b = shadowOffset(z1);
		ctx.lineWidth = r * 2;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(x + a.x, y + a.y);
		ctx.lineTo(x + b.x, y + b.y);
		ctx.stroke();
	}

	private obstacleShadow(o: Obstacle) {
		switch (o.kind) {
			case "rock": {
				const base = this.rockBase(o);
				const h = this.rockHeight(o);
				this.hullShadow([
					...base,
					...offset(shrink(base, 0.6), shadowOffset(h)),
				]);
				break;
			}
			case "cactus":
				this.columnShadow(o.x, o.y, o.r, 0, 2.1);
				for (const arm of this.cactusArms(o))
					this.columnShadow(arm.x, arm.y, arm.r, arm.z0, arm.z1);
				break;
			case "barrel":
				this.columnShadow(o.x, o.y, o.r, 0, 0.95);
				break;
			case "tires":
				for (const t of this.tireStacks(o))
					this.columnShadow(t.x, t.y, t.r, 0, t.count * 0.3);
				break;
		}
	}

	private carShadow(car: VehicleSnapshot) {
		const toWorld = this.carToWorld(car);
		const body = CAR_OUTLINE.map(toWorld);
		const cab = shrink(CAB_OUTLINE, 0.9).map(toWorld);
		this.hullShadow([
			...body,
			...offset(body, shadowOffset(BED_TOP)),
			...offset(cab, shadowOffset(CAB_TOP)),
		]);
	}

	// ---------- Ground ----------

	private drawGround(
		track: Track,
		inView: (x: number, y: number, r: number) => boolean,
	) {
		const ctx = this.ctx;
		for (const d of track.groundDecor) {
			if (!inView(d.x, d.y, d.r * 2)) continue;
			this.planeAt(d.z);
			switch (d.kind) {
				case "patch":
					ctx.fillStyle = d.seed < 0.5 ? C.patchDark : C.patchLight;
					ctx.beginPath();
					ctx.ellipse(d.x, d.y, d.r, d.r * 0.55, d.rot, 0, Math.PI * 2);
					ctx.fill();
					break;
				case "pebble":
					ctx.beginPath();
					ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, d.rot, 0, Math.PI * 2);
					ctx.fillStyle = "#8d7458";
					ctx.fill();
					ctx.lineWidth = 0.05;
					ctx.strokeStyle = INK;
					ctx.stroke();
					break;
				case "tuft":
					ctx.save();
					ctx.translate(d.x, d.y);
					ctx.strokeStyle = "#6e7f2c";
					ctx.lineWidth = 0.08;
					ctx.stroke(this.cached(d, () => this.tuftPath(d)));
					ctx.restore();
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

	private tuftPath(d: Decor): Path2D {
		const rand = mulberry32(Math.floor(d.seed * 1e9));
		const p = new Path2D();
		const blades = 5 + Math.floor(rand() * 4);
		for (let i = 0; i < blades; i++) {
			const a = d.rot + (i / blades) * Math.PI * 2 + rand() * 0.4;
			const len = d.r * (1.2 + rand());
			p.moveTo(0, 0);
			p.quadraticCurveTo(
				Math.cos(a) * len * 0.5 + 0.05,
				Math.sin(a) * len * 0.5,
				Math.cos(a) * len,
				Math.sin(a) * len,
			);
		}
		return p;
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

	private roadHeights(track: Track): number[] {
		const z: number[] = [];
		let along = 0;
		const n = track.centerline.length;
		for (let i = 0; i < n; i++) {
			z.push(track.heightAt(along));
			if (i < n - 1) {
				const a = track.centerline[i];
				const b = track.centerline[i + 1];
				along += Math.hypot(b.x - a.x, b.y - a.y);
			}
		}
		return z;
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
		const z = this.roadHeights(track);
		const n = track.centerline.length;
		const W = track.roadWidth;
		const visible = (i: number) => {
			const c = track.centerline[i];
			return inView(c.x, c.y, W, 3);
		};
		this.screenSpace();
		const band = (extra: number, color: string) => {
			for (let i = 0; i < n - 1; i++) {
				if (!visible(i) && !visible(i + 1)) continue;
				const c0 = track.centerline[i];
				const c1 = track.centerline[i + 1];
				const l0 = this.widen(c0, track.leftEdge[i], extra);
				const r0 = this.widen(c0, track.rightEdge[i], extra);
				const l1 = this.widen(c1, track.leftEdge[i + 1], extra);
				const r1 = this.widen(c1, track.rightEdge[i + 1], extra);
				this.fillScreenPoly(
					[
						this.P(l0.x, l0.y, z[i]),
						this.P(r0.x, r0.y, z[i]),
						this.P(r1.x, r1.y, z[i + 1]),
						this.P(l1.x, l1.y, z[i + 1]),
					],
					color,
					0,
				);
			}
		};
		band(0.7, INK);
		band(0.35, C.shoulder);
		band(0, C.asphalt);

		const ctx = this.ctx;
		const chain = (
			pts: Vec2[],
			color: string,
			width: number,
			dash: number[],
		) => {
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
			ctx.setLineDash(dash);
			ctx.beginPath();
			for (let i = 0; i < n; i++) {
				const p = this.P(pts[i].x, pts[i].y, z[i]);
				if (i === 0) ctx.moveTo(p.x, p.y);
				else ctx.lineTo(p.x, p.y);
			}
			ctx.stroke();
			ctx.setLineDash([]);
		};
		const edgeW = Math.max(1.5, 0.18 * this.s);
		chain(track.leftEdge, C.edgeLine, edgeW, []);
		chain(track.rightEdge, C.edgeLine, edgeW, []);
		chain(track.centerline, C.centerLine, Math.max(2, 0.24 * this.s), [12, 16]);

		this.planeAt(track.heightAt(track.startS));
		this.drawChecker(track.start, track.startAngle, W, 1);
		this.planeAt(track.heightAt(track.finishS));
		this.drawChecker(track.finish, track.finishAngle, W, 3);
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
		}[] = [];
		for (const s of particles.splats) {
			if (!inView(s.x, s.y, s.r * 1.5)) continue;
			const r = s.r * Math.min(1, (s.life / SPLAT_LIFE) * 3);
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
			blobs.push({ path, x: s.x, y: s.y, r, z: s.z });
		}
		// Stroke everything first, then fill over it: overlapping puddles merge into one inked outline.
		ctx.lineWidth = 0.16;
		ctx.strokeStyle = rgb(C.liquidDeep);
		for (const b of blobs) {
			this.planeAt(b.z);
			ctx.strokeStyle = rgb(C.liquidDeep);
			ctx.lineWidth = 0.16;
			ctx.stroke(b.path);
		}
		for (const b of blobs) {
			this.planeAt(b.z);
			ctx.fillStyle = rgb(C.liquidMid);
			ctx.fill(b.path);
		}
		ctx.fillStyle = rgb(C.liquidLight);
		for (const b of blobs) {
			this.planeAt(b.z);
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
	}

	private drawSkids(particles: ParticlePool) {
		const ctx = this.ctx;
		ctx.lineWidth = 0.28;
		for (const k of particles.skids) {
			const a = k.strength * Math.min(1, (k.life / SKID_LIFE) * 2);
			if (a < 0.2) continue;
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
			case "rock":
				this.prism(
					this.rockBase(o),
					o.z,
					o.z + this.rockHeight(o),
					{ top: C.rockTop, lit: C.rock, shade: C.rockShade },
					0.11,
					0.6,
				);
				break;
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
			h,
			{ top: C.barrel, lit: C.barrel, shade: C.barrelShade },
			0.1,
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
			this.columnShadow(p.x, p.y, 0.1, 0, 2.8);
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
		const back = { x: -Math.cos(angle) * 1.5, y: -Math.sin(angle) * 1.5 };
		this.fillScreenPoly(
			[
				this.P(p.x, p.y, poleTop - 0.05),
				this.P(p.x + back.x, p.y + back.y, poleTop - 0.4),
				this.P(p.x, p.y, poleTop - 0.8),
			],
			"#ef4b33",
			0.08 * s,
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
		const wheelColors = { top: "#333", lit: "#3a3a3a", shade: "#151515" };

		const wheels = [
			{ x: 1.3, y: -0.9, steer: car.steerAngle },
			{ x: 1.3, y: 0.9, steer: car.steerAngle },
			{ x: -1.35, y: -0.92, steer: 0 },
			{ x: -1.35, y: 0.92, steer: 0 },
		].map((w) => {
			const c = Math.cos(w.steer);
			const sn = Math.sin(w.steer);
			const corner = (dx: number, dy: number) =>
				toWorld({ x: w.x + dx * c - dy * sn, y: w.y + dx * sn + dy * c });
			const side = Math.sign(w.y);
			return {
				local: w,
				base: [
					corner(-0.4, -0.18),
					corner(0.4, -0.18),
					corner(0.4, 0.18),
					corner(-0.4, 0.18),
				],
				outer: [corner(-0.4, 0.18 * side), corner(0.4, 0.18 * side)],
				side,
			};
		});
		const depthOf = (pts: Vec2[]) => {
			const c = centroid(pts);
			return c.x + c.y;
		};
		wheels.sort((a, b) => depthOf(a.base) - depthOf(b.base));
		for (const w of wheels)
			this.prism(w.base, car.z, car.z + WHEEL_TOP, wheelColors, 0.07);

		this.prism(
			CAR_OUTLINE.map(toWorld),
			car.z + BODY_BOTTOM,
			car.z + BED_TOP,
			{ top: C.body, lit: C.body, shade: C.bodyShade },
			0.12,
			1,
			() => this.drawHood(car, light),
			(i) => -CAR_OUTLINE[i].x * car.pitch,
		);

		// Tire sidewalls that stick out past the body are in front of it.
		for (const w of wheels) {
			const outward = rotate({ x: 0, y: w.side }, car.angle);
			if (outward.x + outward.y <= 0) continue;
			const [a, b] = w.outer;
			const lit = outward.x * SUN_2D.x + outward.y * SUN_2D.y > 0.1;
			this.fillScreenPoly(
				[
					this.P(a.x, a.y, car.z),
					this.P(b.x, b.y, car.z),
					this.P(b.x, b.y, car.z + WHEEL_TOP * 0.62),
					this.P(a.x, a.y, car.z + WHEEL_TOP * 0.62),
				],
				lit ? wheelColors.lit : wheelColors.shade,
				0.07 * this.s,
			);
			this.drawWheelMark(car, w.local, w.side);
		}

		const drawCab = () =>
			this.prism(
				CAB_OUTLINE.map(toWorld),
				car.z + BED_TOP,
				car.z + CAB_TOP,
				{ top: C.roof, lit: C.glass, shade: C.glassShade },
				0.1,
				0.86,
				() => this.drawRoof(car, light),
				(i) => -CAB_OUTLINE[i].x * car.pitch,
			);
		const drawTub = () => this.drawTub(car, fluid, toward);
		const tubDepth = depthOf([toWorld({ x: -1.35, y: 0 })]);
		const cabDepth = depthOf([toWorld({ x: 0.17, y: 0 })]);
		if (tubDepth < cabDepth) {
			drawTub();
			drawCab();
		} else {
			drawCab();
			drawTub();
		}
	}

	private drawWheelMark(
		car: VehicleSnapshot,
		local: { x: number; y: number; steer: number },
		side: number,
	) {
		const spin = car.wheelAngle;
		const c = Math.cos(local.steer);
		const sn = Math.sin(local.steer);
		const along = Math.cos(spin) * 0.22;
		const lx = local.x + along * c;
		const ly = local.y + along * sn + side * 0.2;
		const world = this.carToWorld(car)({ x: lx, y: ly });
		const p = this.P(world.x, world.y, car.z + 0.36 + Math.sin(spin) * 0.16);
		const ctx = this.ctx;
		ctx.fillStyle = "#f4e7c5";
		ctx.beginPath();
		ctx.arc(p.x, p.y, Math.max(2, 0.09 * this.s), 0, Math.PI * 2);
		ctx.fill();
	}

	/** Bonnet and bed-top details, drawn in car-local meters on the body's top plane. */
	private drawHood(car: VehicleSnapshot, light: Vec2) {
		const ctx = this.ctx;
		ctx.translate(car.pos.x, car.pos.y);
		ctx.rotate(car.angle);

		ctx.save();
		ctx.clip(this.carPath);
		ctx.translate(light.x * 0.16, light.y * 0.16);
		ctx.fillStyle = "#ffd36a";
		ctx.globalAlpha = 0.45;
		ctx.fill(this.carPath);
		ctx.restore();

		ctx.fillStyle = C.stripe;
		ctx.fillRect(0.95, -0.34, 1.3, 0.17);
		ctx.fillRect(0.95, 0.17, 1.3, 0.17);
		ctx.fillStyle = "#8a4b1f";
		ctx.beginPath();
		ctx.ellipse(1.75, 0.6, 0.16, 0.09, 0.4, 0, Math.PI * 2);
		ctx.ellipse(-1.6, -0.74, 0.2, 0.07, -0.2, 0, Math.PI * 2);
		ctx.fill();

		const scoop = roundRectPath(1.25, -0.22, 0.62, 0.44, 0.08);
		this.cel(scoop, "#2a1d14", "#4a3628", light.x * 0.04, light.y * 0.04, 0.06);
		for (const side of [-1, 1]) {
			this.cel(
				circlePath(2.08, side * 0.58, 0.13),
				"#d9b44a",
				"#fff3b0",
				-0.02,
				-0.02,
				0.05,
			);
			ctx.fillStyle = "#ff3b2f";
			ctx.fillRect(-2.27, side * 0.62 - 0.1, 0.14, 0.2);
		}

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

	private drawRoof(car: VehicleSnapshot, light: Vec2) {
		const ctx = this.ctx;
		ctx.translate(car.pos.x, car.pos.y);
		ctx.rotate(car.angle);
		ctx.translate(light.x * 0.08, light.y * 0.08);
		ctx.fillStyle = "#ffc451";
		ctx.fillRect(-0.7, -0.7, 1.7, 1.4);
		ctx.translate(-light.x * 0.08, -light.y * 0.08);
		ctx.fillStyle = C.stripe;
		ctx.fillRect(-0.7, -0.34, 1.7, 0.17);
		ctx.fillRect(-0.7, 0.17, 1.7, 0.17);
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
			const p = this.P(d.x, d.y, d.z);
			ctx.beginPath();
			ctx.arc(p.x, p.y, r * this.s, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
	}

	private drawPuffs(particles: ParticlePool) {
		const ctx = this.ctx;
		ctx.lineWidth = 0.06 * this.s;
		const puffs = [...particles.puffs].sort((a, b) => a.x + a.y - (b.x + b.y));
		for (const p of puffs) {
			const a = Math.max(0, p.life / p.maxLife);
			const rise = (1 - a) * 0.8;
			const c = this.P(p.x, p.y, p.z + p.r + rise);
			ctx.beginPath();
			ctx.arc(c.x, c.y, p.r * this.s, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(232, 204, 150, ${a * 0.85})`;
			ctx.fill();
			ctx.strokeStyle = `rgba(120, 88, 52, ${a})`;
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
			const y = screen.y - t * 46 * pr;
			const size = (p.big ? 40 : 26) * pr * (t < 0.12 ? 0.6 + t * 3.3 : 1);
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(-0.08);
			ctx.globalAlpha = Math.min(1, p.life * 3);
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
