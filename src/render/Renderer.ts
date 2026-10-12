import { rotate, type Vec2 } from "../math/vec2";
import type { FluidLayer } from "../physics/FluidLayer";
import { type ParticlePool, SKID_LIFE, SPLAT_LIFE } from "../physics/Particles";
import type { VehicleSnapshot } from "../physics/VehicleSimulation";
import {
	type Decor,
	mulberry32,
	type Obstacle,
	type Track,
} from "../world/Track";
import { shiftHex } from "./liquidColor";
import { drawTrunkIsometric } from "./trunkMeshDraw";

export type Camera = {
	x: number;
	y: number;
	/** CSS pixels per meter */
	zoom: number;
	/** Radians; view roll into turns */
	roll?: number;
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
	barrel: "#d03c2d",
	barrelShade: "#8c2219",
	barrelBand: "#f2c230",
	tire: "#3a3a3a",
	tireShade: "#1f1f1f",
	body: "#f6b72f",
	bodyShade: "#b56c18",
	roof: "#f0a630",
	roofShade: "#a95f12",
	stripe: "#9b2416",
	glass: "#7fc3d6",
	liquidDeep: [24, 112, 32],
	liquidMid: [78, 196, 44],
	liquidLight: [170, 243, 84],
	liquidFoam: [242, 255, 208],
	shadow: "rgba(55, 22, 0, 0.6)",
};

/** Direction toward the sun (upper left) */
const LIGHT: Vec2 = (() => {
	const l = Math.hypot(-0.55, -0.83);
	return { x: -0.55 / l, y: -0.83 / l };
})();
const SHADOW_OFFSET: Vec2 = { x: 0.38, y: 0.58 };

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

/** Draws the flat, outlined comic scene into an offscreen canvas; the ink shader finishes it. */
export class Renderer {
	readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private pixelRatio = 1;
	private readonly trunkSpriteCanvas: HTMLCanvasElement;
	private readonly trunkSpriteCtx: CanvasRenderingContext2D;
	private roadCache: {
		track: Track;
		center: Path2D;
		left: Path2D;
		right: Path2D;
	} | null = null;
	private readonly shapeCache = new WeakMap<object, Path2D>();
	private readonly carPath = polygonPath(CAR_OUTLINE);

	constructor() {
		this.canvas = document.createElement("canvas");
		const ctx = this.canvas.getContext("2d", { alpha: false });
		if (!ctx) throw new Error("2D canvas unavailable");
		this.ctx = ctx;
		this.trunkSpriteCanvas = document.createElement("canvas");
		this.trunkSpriteCanvas.width = 176;
		this.trunkSpriteCanvas.height = 144;
		const tctx = this.trunkSpriteCanvas.getContext("2d");
		if (!tctx) throw new Error("2D canvas unavailable");
		this.trunkSpriteCtx = tctx;
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

	draw(f: RenderFrame) {
		const { ctx, canvas } = this;
		const W = canvas.width;
		const H = canvas.height;
		const s = this.scale(f.camera);
		const cam = f.camera;

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = C.sand;
		ctx.fillRect(0, 0, W, H);
		ctx.setTransform(s, 0, 0, s, W / 2 - cam.x * s, H / 2 - cam.y * s);
		if (cam.roll) {
			ctx.translate(cam.x, cam.y);
			ctx.rotate(cam.roll);
			ctx.translate(-cam.x, -cam.y);
		}
		ctx.lineJoin = "round";
		ctx.lineCap = "round";

		const hw = W / (2 * s) + 3;
		const hh = H / (2 * s) + 3;
		const inView = (x: number, y: number, r: number) =>
			x + r > cam.x - hw &&
			x - r < cam.x + hw &&
			y + r > cam.y - hh &&
			y - r < cam.y + hh;

		this.drawGround(f.track, inView);
		this.drawRoad(f.track);
		this.drawRoadDecor(f.track, inView);
		this.drawSplats(f.particles, inView);
		this.drawSkids(f.particles);
		this.drawObstacles(f.track, inView);
		if (f.ghost) {
			ctx.save();
			ctx.globalAlpha = 0.38;
			this.drawCar(f.ghost.car, f.ghost.fluid);
			ctx.restore();
		}
		this.drawCar(f.car, f.fluid);
		this.drawDroplets(f.particles, f.fluid);
		this.drawPuffs(f.particles);
		if (f.debug) this.drawDebug(f.car, f.fluid);

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.drawPopups(f.particles, cam, s);
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

	private drawGround(
		track: Track,
		inView: (x: number, y: number, r: number) => boolean,
	) {
		const ctx = this.ctx;
		for (const d of track.groundDecor) {
			if (!inView(d.x, d.y, d.r * 2)) continue;
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

	private roadPaths(track: Track) {
		if (this.roadCache?.track === track) return this.roadCache;
		const line = (pts: Vec2[]) => {
			const p = new Path2D();
			pts.forEach((pt, i) =>
				i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y),
			);
			return p;
		};
		this.roadCache = {
			track,
			center: line(track.centerline),
			left: line(track.leftEdge),
			right: line(track.rightEdge),
		};
		return this.roadCache;
	}

	private drawRoad(track: Track) {
		const ctx = this.ctx;
		const { center, left, right } = this.roadPaths(track);
		const W = track.roadWidth;

		ctx.strokeStyle = INK;
		ctx.lineWidth = W + 1.1;
		ctx.stroke(center);
		ctx.strokeStyle = C.shoulder;
		ctx.lineWidth = W + 0.6;
		ctx.stroke(center);
		ctx.strokeStyle = C.asphalt;
		ctx.lineWidth = W;
		ctx.stroke(center);

		ctx.strokeStyle = C.edgeLine;
		ctx.lineWidth = 0.28;
		ctx.stroke(left);
		ctx.stroke(right);

		ctx.strokeStyle = C.centerLine;
		ctx.lineWidth = 0.36;
		ctx.setLineDash([3, 4]);
		ctx.stroke(center);
		ctx.setLineDash([]);

		this.drawChecker(track.start, track.startAngle, W, 1);
		this.drawChecker(track.finish, track.finishAngle, W, 3);
		this.drawFinishFlags(track);
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

	private drawFinishFlags(track: Track) {
		const ctx = this.ctx;
		const { finish, finishAngle, roadWidth } = track;
		const n = { x: -Math.sin(finishAngle), y: Math.cos(finishAngle) };
		for (const side of [-1, 1]) {
			const px = finish.x + n.x * (roadWidth / 2 + 1.3) * side;
			const py = finish.y + n.y * (roadWidth / 2 + 1.3) * side;
			ctx.fillStyle = C.shadow;
			ctx.beginPath();
			ctx.ellipse(
				px + SHADOW_OFFSET.x,
				py + SHADOW_OFFSET.y,
				0.4,
				0.3,
				0,
				0,
				Math.PI * 2,
			);
			ctx.fill();
			const flag = new Path2D();
			flag.moveTo(px, py);
			flag.lineTo(px - 1.6, py - 0.5);
			flag.lineTo(px - 0.2, py - 1.1);
			flag.closePath();
			this.cel(flag, "#a3241a", "#ef4b33", LIGHT.x * 0.15, LIGHT.y * 0.15, 0.1);
			this.cel(circlePath(px, py, 0.25), "#555", "#9a9a9a", -0.05, -0.05, 0.08);
		}
	}

	private drawRoadDecor(
		track: Track,
		inView: (x: number, y: number, r: number) => boolean,
	) {
		const ctx = this.ctx;
		for (const d of track.roadDecor) {
			if (!inView(d.x, d.y, d.r)) continue;
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
		const blobs: { path: Path2D; x: number; y: number; r: number }[] = [];
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
			blobs.push({ path, x: s.x, y: s.y, r });
		}
		// Stroke everything first, then fill over it: overlapping puddles merge into one inked outline.
		ctx.lineWidth = 0.16;
		ctx.strokeStyle = rgb(C.liquidDeep);
		for (const b of blobs) ctx.stroke(b.path);
		ctx.fillStyle = rgb(C.liquidMid);
		for (const b of blobs) ctx.fill(b.path);
		ctx.fillStyle = rgb(C.liquidLight);
		for (const b of blobs) {
			ctx.beginPath();
			ctx.ellipse(
				b.x - b.r * 0.3,
				b.y - b.r * 0.35,
				b.r * 0.35,
				b.r * 0.16,
				-0.6,
				0,
				Math.PI * 2,
			);
			ctx.fill();
		}
	}

	private drawSkids(particles: ParticlePool) {
		const ctx = this.ctx;
		const buckets = 5;
		const paths: Path2D[] = Array.from({ length: buckets }, () => new Path2D());
		for (const k of particles.skids) {
			const a = k.strength * Math.min(1, (k.life / SKID_LIFE) * 2);
			const b = Math.min(buckets - 1, Math.floor(a * buckets));
			if (b <= 0) continue;
			paths[b].moveTo(k.x1, k.y1);
			paths[b].lineTo(k.x2, k.y2);
		}
		ctx.lineWidth = 0.28;
		for (let b = 1; b < buckets; b++) {
			ctx.strokeStyle = `rgba(42, 29, 20, ${(b / buckets) * 0.6})`;
			ctx.stroke(paths[b]);
		}
	}

	private drawObstacles(
		track: Track,
		inView: (x: number, y: number, r: number) => boolean,
	) {
		const ctx = this.ctx;
		const visible = track.obstacles.filter((o) => inView(o.x, o.y, o.r * 2.2));

		ctx.fillStyle = C.shadow;
		for (const o of visible) {
			ctx.beginPath();
			if (o.kind === "rock") {
				ctx.save();
				ctx.translate(
					o.x + SHADOW_OFFSET.x * o.r * 0.6,
					o.y + SHADOW_OFFSET.y * o.r * 0.6,
				);
				ctx.fill(this.rockPath(o));
				ctx.restore();
			} else {
				const r =
					o.kind === "cactus"
						? o.r * 1.35
						: o.kind === "tires"
							? o.r * 1.2
							: o.r;
				ctx.ellipse(
					o.x + SHADOW_OFFSET.x,
					o.y + SHADOW_OFFSET.y,
					r,
					r * 0.8,
					0,
					0,
					Math.PI * 2,
				);
				ctx.fill();
			}
		}

		for (const o of visible) {
			switch (o.kind) {
				case "rock":
					this.drawRock(o);
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
	}

	private rockPath(o: Obstacle): Path2D {
		return this.cached(o, () => polygonPath(o.shape));
	}

	private drawRock(o: Obstacle) {
		const ctx = this.ctx;
		const path = this.rockPath(o);
		ctx.save();
		ctx.translate(o.x, o.y);
		this.cel(
			path,
			C.rockShade,
			C.rock,
			LIGHT.x * o.r * 0.28,
			LIGHT.y * o.r * 0.28,
			0.13,
		);
		ctx.save();
		ctx.translate(LIGHT.x * o.r * 0.3, LIGHT.y * o.r * 0.3);
		ctx.scale(0.45, 0.45);
		ctx.fillStyle = C.rockTop;
		ctx.fill(path);
		ctx.restore();
		const v = o.shape[0];
		ctx.strokeStyle = INK;
		ctx.lineWidth = 0.06;
		ctx.beginPath();
		ctx.moveTo(v.x * 0.15, v.y * 0.15);
		ctx.lineTo(v.x * 0.55, v.y * 0.55 + 0.1);
		ctx.lineTo(v.x * 0.8, v.y * 0.8);
		ctx.stroke();
		ctx.restore();
	}

	private drawCactus(o: Obstacle) {
		const ctx = this.ctx;
		const lx = LIGHT.x * o.r * 0.3;
		const ly = LIGHT.y * o.r * 0.3;
		const arms = [o.rot, o.rot + 2.4];
		if (o.rot > Math.PI) arms.push(o.rot + 4.2);
		for (const a of arms) {
			const ax = o.x + Math.cos(a) * o.r * 1.15;
			const ay = o.y + Math.sin(a) * o.r * 1.15;
			this.cel(
				circlePath(ax, ay, o.r * 0.55),
				C.cactusShade,
				C.cactus,
				lx * 0.6,
				ly * 0.6,
				0.1,
			);
		}
		this.cel(circlePath(o.x, o.y, o.r), C.cactusShade, C.cactus, lx, ly, 0.11);
		ctx.strokeStyle = "rgba(27, 18, 11, 0.7)";
		ctx.lineWidth = 0.035;
		ctx.beginPath();
		for (let k = 0; k < 7; k++) {
			const a = (k / 7) * Math.PI * 2 + o.rot;
			ctx.moveTo(
				o.x + Math.cos(a) * o.r * 0.25,
				o.y + Math.sin(a) * o.r * 0.25,
			);
			ctx.lineTo(
				o.x + Math.cos(a) * o.r * 0.88,
				o.y + Math.sin(a) * o.r * 0.88,
			);
		}
		ctx.stroke();
		if (o.rot < 1.2) {
			this.cel(
				circlePath(o.x, o.y, o.r * 0.28),
				"#c2367a",
				"#ff6fb0",
				-0.03,
				-0.03,
				0.05,
			);
		}
	}

	private drawBarrel(o: Obstacle) {
		const ctx = this.ctx;
		this.cel(
			circlePath(o.x, o.y, o.r),
			C.barrelShade,
			C.barrel,
			LIGHT.x * 0.12,
			LIGHT.y * 0.12,
			0.11,
		);
		ctx.lineWidth = 0.09;
		ctx.strokeStyle = C.barrelBand;
		ctx.beginPath();
		ctx.arc(o.x, o.y, o.r * 0.8, 0, Math.PI * 2);
		ctx.stroke();
		ctx.lineWidth = 0.05;
		ctx.strokeStyle = INK;
		ctx.beginPath();
		ctx.arc(o.x, o.y, o.r * 0.6, 0, Math.PI * 2);
		ctx.stroke();
		this.cel(
			circlePath(
				o.x + Math.cos(o.rot) * o.r * 0.35,
				o.y + Math.sin(o.rot) * o.r * 0.35,
				o.r * 0.12,
			),
			"#3b3b3b",
			"#6d6d6d",
			-0.02,
			-0.02,
			0.04,
		);
	}

	private drawTires(o: Obstacle) {
		const ctx = this.ctx;
		for (let k = 0; k < 3; k++) {
			const a = o.rot + k * 2.1;
			const x = o.x + Math.cos(a) * o.r * 0.55;
			const y = o.y + Math.sin(a) * o.r * 0.55;
			const r = o.r * 0.62;
			this.cel(
				circlePath(x, y, r),
				C.tireShade,
				C.tire,
				LIGHT.x * 0.1,
				LIGHT.y * 0.1,
				0.09,
			);
			ctx.fillStyle = "#7b5532";
			ctx.beginPath();
			ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
			ctx.fill();
			ctx.lineWidth = 0.05;
			ctx.strokeStyle = INK;
			ctx.stroke();
		}
	}

	private drawCar(car: VehicleSnapshot, fluid: FluidLayer) {
		const ctx = this.ctx;
		const { pos, angle } = car;
		const light = rotate(LIGHT, -angle);

		ctx.save();
		ctx.translate(pos.x + SHADOW_OFFSET.x, pos.y + SHADOW_OFFSET.y);
		ctx.rotate(angle);
		ctx.fillStyle = C.shadow;
		ctx.fill(this.carPath);
		ctx.restore();

		ctx.save();
		ctx.translate(pos.x, pos.y);
		ctx.rotate(angle);

		const wheel = (x: number, y: number, steer: number) => {
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(steer);
			const w = roundRectPath(-0.4, -0.18, 0.8, 0.36, 0.09);
			this.cel(w, "#151515", "#333", light.x * 0.05, light.y * 0.05, 0.08);
			ctx.restore();
		};
		wheel(1.3, -0.9, car.steerAngle);
		wheel(1.3, 0.9, car.steerAngle);
		wheel(-1.35, -0.92, 0);
		wheel(-1.35, 0.92, 0);

		this.cel(
			this.carPath,
			C.bodyShade,
			C.body,
			light.x * 0.16,
			light.y * 0.16,
			0.13,
		);

		ctx.save();
		ctx.clip(this.carPath);
		ctx.fillStyle = C.stripe;
		ctx.fillRect(0.95, -0.34, 1.4, 0.17);
		ctx.fillRect(0.95, 0.17, 1.4, 0.17);
		ctx.fillStyle = "#8a4b1f";
		ctx.beginPath();
		ctx.ellipse(1.75, 0.6, 0.16, 0.09, 0.4, 0, Math.PI * 2);
		ctx.ellipse(-1.6, -0.74, 0.2, 0.07, -0.2, 0, Math.PI * 2);
		ctx.ellipse(0.3, 0.76, 0.12, 0.05, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();

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
			ctx.fillRect(-2.3, side * 0.62 - 0.1, 0.14, 0.2);
			ctx.lineWidth = 0.04;
			ctx.strokeStyle = INK;
			ctx.strokeRect(-2.3, side * 0.62 - 0.1, 0.14, 0.2);
		}
		const bumperF = roundRectPath(2.2, -0.62, 0.16, 1.24, 0.06);
		const bumperR = roundRectPath(-2.42, -0.6, 0.16, 1.2, 0.06);
		this.cel(bumperF, "#262626", "#4b4b4b", 0, -0.03, 0.06);
		this.cel(bumperR, "#262626", "#4b4b4b", 0, -0.03, 0.06);

		const glass = polygonPath([
			{ x: 0.98, y: -0.64 },
			{ x: 0.98, y: 0.64 },
			{ x: 0.56, y: 0.58 },
			{ x: 0.56, y: -0.58 },
		]);
		ctx.fillStyle = C.glass;
		ctx.fill(glass);
		ctx.lineWidth = 0.07;
		ctx.strokeStyle = INK;
		ctx.stroke(glass);
		ctx.strokeStyle = "#f5ffff";
		ctx.lineWidth = 0.07;
		ctx.beginPath();
		ctx.moveTo(0.9, -0.45);
		ctx.lineTo(0.66, -0.12);
		ctx.stroke();

		const roof = roundRectPath(-0.64, -0.64, 1.2, 1.28, 0.2);
		this.cel(roof, C.roofShade, C.roof, light.x * 0.1, light.y * 0.1, 0.09);
		ctx.fillStyle = C.stripe;
		ctx.save();
		ctx.clip(roof);
		ctx.fillRect(-0.7, -0.34, 1.3, 0.17);
		ctx.fillRect(-0.7, 0.17, 1.3, 0.17);
		ctx.restore();
		ctx.strokeStyle = INK;
		ctx.lineWidth = 0.09;
		ctx.beginPath();
		ctx.moveTo(-0.52, -0.62);
		ctx.lineTo(-0.52, 0.62);
		ctx.stroke();

		this.drawTub(car, fluid, light);
		ctx.restore();
	}

	private drawTub(car: VehicleSnapshot, fluid: FluidLayer, light: Vec2) {
		const ctx = this.ctx;
		const t = car.trunkLocal;
		const w = t.maxX - t.minX;
		const h = t.maxY - t.minY;
		const rim = roundRectPath(
			t.minX - 0.08,
			t.minY - 0.08,
			w + 0.16,
			h + 0.16,
			0.12,
		);
		this.cel(rim, "#4a453f", "#7a736a", light.x * 0.05, light.y * 0.05, 0.1);
		ctx.fillStyle = "#2a2420";
		ctx.fillRect(t.minX, t.minY, w, h);

		drawTrunkIsometric(
			this.trunkSpriteCtx,
			fluid,
			this.trunkSpriteCanvas.width,
			this.trunkSpriteCanvas.height,
			{
				showCom: false,
				showVelocityArrows: false,
				pad: 14,
			},
		);
		ctx.save();
		ctx.beginPath();
		ctx.rect(t.minX, t.minY, w, h);
		ctx.clip();
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(this.trunkSpriteCanvas, t.minX, t.minY, w, h);
		ctx.restore();

		ctx.lineWidth = 0.05;
		ctx.strokeStyle = INK;
		ctx.strokeRect(t.minX, t.minY, w, h);
		ctx.fillStyle = "#c9c1b5";
		for (const [x, y] of [
			[t.minX - 0.04, t.minY - 0.04],
			[t.maxX + 0.04, t.minY - 0.04],
			[t.minX - 0.04, t.maxY + 0.04],
			[t.maxX + 0.04, t.maxY + 0.04],
		]) {
			ctx.beginPath();
			ctx.arc(x, y, 0.035, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	private drawDroplets(particles: ParticlePool, fluid: FluidLayer) {
		const ctx = this.ctx;
		ctx.fillStyle = "rgba(40, 25, 10, 0.18)";
		for (const d of particles.droplets) {
			ctx.beginPath();
			ctx.ellipse(d.x, d.y, 0.14, 0.1, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = shiftHex("#aaf354", fluid.colorShift);
		for (const d of particles.droplets) {
			const r = Math.max(0.1, Math.min(0.22, Math.cbrt(d.volume) * 1.1));
			ctx.beginPath();
			ctx.arc(d.x, d.y - d.z * 0.6, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	private drawPuffs(particles: ParticlePool) {
		const ctx = this.ctx;
		ctx.lineWidth = 0.06;
		for (const p of particles.puffs) {
			const a = Math.max(0, p.life / p.maxLife);
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(232, 204, 150, ${a * 0.85})`;
			ctx.fill();
			ctx.strokeStyle = `rgba(120, 88, 52, ${a})`;
			ctx.stroke();
		}
	}

	private drawPopups(particles: ParticlePool, cam: Camera, s: number) {
		const ctx = this.ctx;
		const W = this.canvas.width;
		const H = this.canvas.height;
		const pr = this.pixelRatio;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		for (const p of particles.popups) {
			const maxLife = p.big ? 1.4 : 1.0;
			const t = 1 - p.life / maxLife;
			const x = (p.x - cam.x) * s + W / 2;
			const y = (p.y - cam.y) * s + H / 2 - t * 46 * pr;
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
