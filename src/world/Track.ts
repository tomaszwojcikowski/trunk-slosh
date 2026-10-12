import type { Vec2 } from "../math/vec2";
import {
	bankFromCurvature,
	type Furniture,
	furnitureFor,
	gradeAccel,
	inWashAt,
	liquidBodyAccel,
	roadGrade,
	roadHeight,
} from "./grade";

export type TrackSegment = {
	a: Vec2;
	b: Vec2;
	normal: Vec2;
	length: number;
	/** Distance along the route at `a` */
	start: number;
};

export type ObstacleKind = "rock" | "cactus" | "barrel" | "tires";

export type Obstacle = {
	kind: ObstacleKind;
	x: number;
	y: number;
	/** Collision radius in meters */
	r: number;
	rot: number;
	/** Rock outline (relative to x,y); empty for round props */
	shape: Vec2[];
	/** Rolling barrel (Matter dynamic body, capped count) */
	dynamic?: boolean;
	/** Local ground height (m) */
	z: number;
};

export type TrackArchetype = "flats" | "canyon" | "boulder";
export type Difficulty = "easy" | "medium" | "hard";

export type TrackOptions = {
	archetype?: TrackArchetype | "auto";
	difficulty?: Difficulty;
};

export function resolveArchetype(
	seed: number,
	pick: TrackArchetype | "auto",
): TrackArchetype {
	if (pick !== "auto") return pick;
	const band = seed % 3;
	return band === 0 ? "flats" : band === 1 ? "canyon" : "boulder";
}

function roadWidthForDifficulty(d: Difficulty): number {
	if (d === "easy") return 14;
	if (d === "hard") return 10;
	return 12;
}

export type DecorKind = "patch" | "pebble" | "tuft" | "bones" | "crack" | "oil";

export type Decor = {
	kind: DecorKind;
	x: number;
	y: number;
	r: number;
	rot: number;
	seed: number;
	/** Local ground height (m) */
	z: number;
};

export type TrackQuery = {
	dist: number;
	angle: number;
	onRoad: boolean;
	closest: Vec2;
	along: number;
};

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function chaikin(points: Vec2[]): Vec2[] {
	const out: Vec2[] = [points[0]];
	for (let i = 0; i < points.length - 1; i++) {
		const p = points[i];
		const q = points[i + 1];
		out.push(
			{ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 },
			{ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 },
		);
	}
	out.push(points[points.length - 1]);
	return out;
}

const LEAD = 26;

/** Procedural desert road. All distances are in meters. */
export class Track {
	readonly seed: number;
	readonly archetype: TrackArchetype;
	readonly difficulty: Difficulty;
	readonly roadWidth: number;
	/** Route distances (m) for segment checkpoints */
	readonly checkpoints: number[] = [];
	centerline: Vec2[] = [];
	leftEdge: Vec2[] = [];
	rightEdge: Vec2[] = [];
	segments: TrackSegment[] = [];
	totalLength = 0;
	/** Route distance of the start / finish lines; road continues past both */
	startS = 0;
	finishS = 0;
	start: Vec2 = { x: 0, y: 0 };
	startAngle = 0;
	finish: Vec2 = { x: 0, y: 0 };
	finishAngle = 0;
	obstacles: Obstacle[] = [];
	groundDecor: Decor[] = [];
	roadDecor: Decor[] = [];
	/** Ramp and wash centers. Null on flats, which stay at z = 0. */
	furniture: Furniture | null = null;

	constructor(seed = 42, options: TrackOptions = {}) {
		this.seed = seed;
		this.difficulty = options.difficulty ?? "medium";
		this.archetype = resolveArchetype(seed, options.archetype ?? "auto");
		this.roadWidth = roadWidthForDifficulty(this.difficulty);
		this.generate(seed);
	}

	private generate(seed: number) {
		const rand = mulberry32(seed);
		const step = 16;
		const count =
			this.archetype === "flats" ? 78 : this.archetype === "canyon" ? 88 : 84;
		const maxCurve =
			this.archetype === "flats"
				? 0.2
				: this.archetype === "canyon"
					? 0.38
					: 0.28;
		const raw: Vec2[] = [{ x: 0, y: 0 }];
		let heading = rand() * Math.PI * 2;
		let curve = 0;

		for (let i = 0; i < count; i++) {
			curve = Math.max(
				-maxCurve,
				Math.min(maxCurve, (curve + (rand() - 0.5) * 0.3) * 0.85),
			);
			const last = raw[raw.length - 1];
			let placed = false;
			for (let attempt = 0; attempt < 12 && !placed; attempt++) {
				const h =
					heading + curve + (attempt > 0 ? (rand() - 0.5) * attempt * 0.45 : 0);
				const p = {
					x: last.x + Math.cos(h) * step,
					y: last.y + Math.sin(h) * step,
				};
				const clear = raw.every(
					(q, idx) =>
						idx >= raw.length - 3 ||
						Math.hypot(q.x - p.x, q.y - p.y) > this.roadWidth * 2.6,
				);
				if (clear) {
					raw.push(p);
					heading = h;
					placed = true;
				}
			}
			if (!placed) break;
		}

		const smooth = chaikin(chaikin(raw));
		this.centerline = smooth;
		this.segments = [];
		this.totalLength = 0;
		for (let i = 0; i < smooth.length - 1; i++) {
			const a = smooth[i];
			const b = smooth[i + 1];
			const length = Math.hypot(b.x - a.x, b.y - a.y);
			if (length < 1e-4) continue;
			const tx = (b.x - a.x) / length;
			const ty = (b.y - a.y) / length;
			this.segments.push({
				a,
				b,
				normal: { x: -ty, y: tx },
				length,
				start: this.totalLength,
			});
			this.totalLength += length;
		}

		const edgeOffset = this.roadWidth / 2 - 0.7;
		this.leftEdge = [];
		this.rightEdge = [];
		for (let i = 0; i < smooth.length; i++) {
			const prev =
				this.segments[Math.max(0, Math.min(this.segments.length - 1, i - 1))];
			const next = this.segments[Math.min(this.segments.length - 1, i)];
			let nx = prev.normal.x + next.normal.x;
			let ny = prev.normal.y + next.normal.y;
			const nl = Math.hypot(nx, ny) || 1;
			nx /= nl;
			ny /= nl;
			const p = smooth[i];
			this.leftEdge.push({
				x: p.x - nx * edgeOffset,
				y: p.y - ny * edgeOffset,
			});
			this.rightEdge.push({
				x: p.x + nx * edgeOffset,
				y: p.y + ny * edgeOffset,
			});
		}

		const lead = Math.min(LEAD, this.totalLength * 0.1);
		this.startS = lead;
		this.finishS = this.totalLength - lead;
		const start = this.pointAt(this.startS);
		const finish = this.pointAt(this.finishS);
		this.start = start.p;
		this.startAngle = start.angle;
		this.finish = finish.p;
		this.finishAngle = finish.angle;

		const span = this.finishS - this.startS;
		this.checkpoints.length = 0;
		for (let i = 1; i <= 3; i++)
			this.checkpoints.push(this.startS + (span * i) / 4);

		this.furniture = furnitureFor(this.archetype, this.startS, this.finishS);
		this.placeObstacles(rand);
		this.placeDecor(rand);
	}

	heightAt(s: number): number {
		return roadHeight(this.archetype, s, this.furniture);
	}

	/** dh/ds along the centerline, including a ramp or wash when one is under `s`. */
	gradeAt(s: number): number {
		return roadGrade(this.archetype, s, this.furniture);
	}

	/** Signed lateral slope. Positive banks a left turn so liquid goes outside. */
	bankAt(s: number): number {
		return bankFromCurvature(this.curvatureAt(s));
	}

	curvatureAt(s: number): number {
		const ds = 3;
		const s0 = Math.max(0, s - ds);
		const s1 = Math.min(this.totalLength, s + ds);
		const span = s1 - s0;
		if (span < 1e-3) return 0;
		let d = this.pointAt(s1).angle - this.pointAt(s0).angle;
		d = Math.atan2(Math.sin(d), Math.cos(d));
		return d / span;
	}

	inWash(s: number): boolean {
		return inWashAt(s, this.furniture);
	}

	private frameAt(s: number): { t: Vec2; n: Vec2 } {
		const p = this.pointAt(s);
		return {
			t: { x: Math.cos(p.angle), y: Math.sin(p.angle) },
			n: p.n,
		};
	}

	/** Longitudinal grade acceleration for the chassis. Banking is not included. */
	gradeForceAt(s: number): Vec2 {
		const { t } = this.frameAt(s);
		return gradeAccel(this.gradeAt(s), t);
	}

	/** Grade plus bank, the body acceleration the liquid feels. */
	liquidAccelAt(s: number): Vec2 {
		const { t, n } = this.frameAt(s);
		return liquidBodyAccel(this.gradeAt(s), this.bankAt(s), t, n);
	}

	private placeObstacles(rand: () => number) {
		this.obstacles = [];
		const half = this.roadWidth / 2;
		const base =
			this.difficulty === "hard" ? 2.8 : this.difficulty === "easy" ? 5.2 : 3.5;
		const archMul = this.archetype === "boulder" ? 0.72 : 1;
		let dynamicBarrels = 0;
		for (
			let s = 12;
			s < this.totalLength - 6;
			s += base + rand() * 5 * archMul
		) {
			const { p, n } = this.pointAt(s);
			const side = rand() < 0.5 ? -1 : 1;
			const off = half + 2.4 + rand() * rand() * 16;
			const x = p.x + n.x * off * side;
			const y = p.y + n.y * off * side;
			const roll = rand();
			const kind: ObstacleKind =
				roll < 0.5
					? "rock"
					: roll < 0.78
						? "cactus"
						: roll < 0.9
							? "barrel"
							: "tires";
			const r =
				kind === "rock"
					? 0.8 + rand() * 1.7
					: kind === "cactus"
						? 0.42
						: kind === "barrel"
							? 0.45
							: 0.62;
			if (this.query({ x, y }).dist < half + r + 0.9) continue;
			if (
				this.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 0.8)
			)
				continue;

			const shape: Vec2[] = [];
			if (kind === "rock") {
				const verts = 7 + Math.floor(rand() * 3);
				for (let k = 0; k < verts; k++) {
					const a = (k / verts) * Math.PI * 2 + rand() * 0.3;
					const rr = r * (0.78 + rand() * 0.32);
					shape.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
				}
			}
			const dynamic = kind === "barrel" && dynamicBarrels < 8;
			if (dynamic) dynamicBarrels++;
			this.obstacles.push({
				kind,
				x,
				y,
				r,
				rot: rand() * Math.PI * 2,
				shape,
				dynamic,
				z: this.heightAt(s),
			});
		}
	}

	private placeDecor(rand: () => number) {
		this.groundDecor = [];
		this.roadDecor = [];
		const half = this.roadWidth / 2;

		for (let s = 0; s < this.totalLength; s += 9) {
			const { p, n } = this.pointAt(s);
			for (const side of [-1, 1]) {
				const off = rand() * 34;
				this.groundDecor.push({
					kind: "patch",
					x: p.x + n.x * off * side,
					y: p.y + n.y * off * side,
					r: 3 + rand() * 7,
					rot: rand() * Math.PI,
					seed: rand(),
					z: this.heightAt(s),
				});
			}
		}

		for (let s = 0; s < this.totalLength; s += 0.7) {
			const { p, n } = this.pointAt(s);
			const side = rand() < 0.5 ? -1 : 1;
			const off = half + 0.8 + rand() * 30;
			const roll = rand();
			const kind: DecorKind =
				roll < 0.45
					? "pebble"
					: roll < 0.78
						? "tuft"
						: roll < 0.84
							? "bones"
							: "crack";
			this.groundDecor.push({
				kind,
				x: p.x + n.x * off * side,
				y: p.y + n.y * off * side,
				r: kind === "crack" ? 1.2 + rand() * 2 : 0.15 + rand() * 0.35,
				rot: rand() * Math.PI * 2,
				seed: rand(),
				z: this.heightAt(s),
			});
		}

		for (let s = 6; s < this.totalLength; s += 6 + rand() * 10) {
			const { p, n } = this.pointAt(s);
			const off = (rand() - 0.5) * (this.roadWidth - 2);
			this.roadDecor.push({
				kind: rand() < 0.65 ? "crack" : "oil",
				x: p.x + n.x * off,
				y: p.y + n.y * off,
				r: 0.8 + rand() * 1.6,
				rot: rand() * Math.PI * 2,
				seed: rand(),
				z: this.heightAt(s),
			});
		}
	}

	/** Point and left-to-right normal at distance `s` along the route */
	pointAt(s: number): { p: Vec2; n: Vec2; angle: number } {
		const clamped = Math.max(0, Math.min(this.totalLength, s));
		let lo = 0;
		let hi = this.segments.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.segments[mid].start <= clamped) lo = mid;
			else hi = mid - 1;
		}
		const seg = this.segments[lo];
		const t = Math.min(1, (clamped - seg.start) / seg.length);
		return {
			p: {
				x: seg.a.x + (seg.b.x - seg.a.x) * t,
				y: seg.a.y + (seg.b.y - seg.a.y) * t,
			},
			n: seg.normal,
			angle: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x),
		};
	}

	query(pos: Vec2): TrackQuery {
		let bestDist = Infinity;
		let bestAngle = 0;
		let bestPoint: Vec2 = { x: pos.x, y: pos.y };
		let along = 0;

		for (const seg of this.segments) {
			const abx = seg.b.x - seg.a.x;
			const aby = seg.b.y - seg.a.y;
			const t = Math.max(
				0,
				Math.min(
					1,
					((pos.x - seg.a.x) * abx + (pos.y - seg.a.y) * aby) /
						(seg.length * seg.length),
				),
			);
			const cx = seg.a.x + abx * t;
			const cy = seg.a.y + aby * t;
			const d = Math.hypot(pos.x - cx, pos.y - cy);
			if (d < bestDist) {
				bestDist = d;
				bestAngle = Math.atan2(aby, abx);
				bestPoint = { x: cx, y: cy };
				along = seg.start + seg.length * t;
			}
		}

		return {
			dist: bestDist,
			angle: bestAngle,
			onRoad: bestDist <= this.roadWidth * 0.5,
			closest: bestPoint,
			along,
		};
	}

	progress(pos: Vec2): number {
		const span = this.finishS - this.startS || 1;
		return Math.max(
			0,
			Math.min(1, (this.query(pos).along - this.startS) / span),
		);
	}
}
