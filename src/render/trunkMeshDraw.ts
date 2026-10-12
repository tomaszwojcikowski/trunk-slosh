import type { Vec2 } from "../math/vec2";
import type { FluidLayer } from "../physics/FluidLayer";
import { TRUNK_LOCAL } from "../physics/trunkConstants";
import { isoProject } from "./isoProject";
import { shiftHex } from "./liquidColor";
import { INK } from "./Renderer";
import { SUN } from "./sun";

const WALL = {
	wall: "#7a736a",
	wallShade: "#3d3833",
	floor: "#2a2420",
	foam: "#f2ffd0",
};

function liquidPalette(shift: number) {
	return {
		deep: shiftHex("#187020", shift),
		mid: shiftHex("#4ec42c", shift),
		light: shiftHex("#aaf354", shift),
		specular: shiftHex("#d4ff9a", shift),
		foam: WALL.foam,
	};
}

type P3 = { x: number; y: number; z: number };
type Screen = { sx: number; sy: number };
export type TubProjector = (x: number, y: number, z: number) => Screen;

export type TubMeshOptions = {
	/** Tub-local meters (z above the tub floor) to canvas pixels */
	toScreen: TubProjector;
	/** Horizontal direction toward the viewer in tub-local axes */
	toward: Vec2;
	/** Direction toward the sun in tub-local axes */
	light: P3;
	/** Pixels per meter, for ink widths */
	scale: number;
	/** Draw the outside of the near walls (free-standing tub). Off when the tub is sunk into a bed. */
	nearWalls: boolean;
};

export type TrunkDrawOptions = {
	label?: string;
	showVelocityArrows?: boolean;
	/** Sample every N grid cells for flow arrows */
	arrowEvery?: number;
	showCom?: boolean;
	pad?: number;
};

export function cornerHeight(
	fluid: FluidLayer,
	ci: number,
	cj: number,
): number {
	const { nx, ny } = fluid;
	let s = 0;
	let n = 0;
	for (const [di, dj] of [
		[0, 0],
		[-1, 0],
		[0, -1],
		[-1, -1],
	]) {
		const i = ci + di;
		const j = cj + dj;
		if (i >= 0 && i < nx && j >= 0 && j < ny) {
			s += fluid.heightAt(i, j);
			n++;
		}
	}
	return n ? s / n : 0;
}

function shadeTri(
	a: P3,
	b: P3,
	c: P3,
	wallHeight: number,
	light: P3,
	liquid: ReturnType<typeof liquidPalette>,
): string {
	const ux = b.x - a.x;
	const uy = b.y - a.y;
	const uz = b.z - a.z;
	const vx = c.x - a.x;
	const vy = c.y - a.y;
	const vz = c.z - a.z;
	let nx = uy * vz - uz * vy;
	let ny = uz * vx - ux * vz;
	let nz = ux * vy - uy * vx;
	const nlen = Math.hypot(nx, ny, nz) || 1;
	nx /= nlen;
	ny /= nlen;
	nz /= nlen;
	if (nz < 0) {
		nx = -nx;
		ny = -ny;
		nz = -nz;
	}
	const lit = nx * light.x + ny * light.y + nz * light.z;
	if ((a.z + b.z + c.z) / 3 > wallHeight * 0.88) return liquid.foam;
	if (lit > 0.92) return liquid.specular;
	if (lit > 0.78) return liquid.light;
	if (lit < 0.6) return liquid.deep;
	return liquid.mid;
}

type Wall = { a: Vec2; b: Vec2; n: Vec2 };

function tubWalls(): Wall[] {
	const { minX, maxX, minY, maxY } = TRUNK_LOCAL;
	return [
		{ a: { x: minX, y: minY }, b: { x: maxX, y: minY }, n: { x: 0, y: -1 } },
		{ a: { x: maxX, y: minY }, b: { x: maxX, y: maxY }, n: { x: 1, y: 0 } },
		{ a: { x: maxX, y: maxY }, b: { x: minX, y: maxY }, n: { x: 0, y: 1 } },
		{ a: { x: minX, y: maxY }, b: { x: minX, y: minY }, n: { x: -1, y: 0 } },
	];
}

/**
 * Tub floor, walls and liquid surface in back-to-front order: floor, far walls (inside faces),
 * liquid, then near walls. Shared by the HUD panel and the in-world truck bed.
 */
export function drawTubMesh(
	ctx: CanvasRenderingContext2D,
	fluid: FluidLayer,
	o: TubMeshOptions,
) {
	const { toScreen, toward, light } = o;
	const liquid = liquidPalette(fluid.colorShift);
	const wh = fluid.wallHeight;
	const { minX, maxX, minY, maxY } = TRUNK_LOCAL;
	const depth = (p: P3) => p.x * toward.x + p.y * toward.y + p.z;

	const poly = (pts: P3[], fill: string) => {
		ctx.beginPath();
		pts.forEach((p, i) => {
			const s = toScreen(p.x, p.y, p.z);
			if (i === 0) ctx.moveTo(s.sx, s.sy);
			else ctx.lineTo(s.sx, s.sy);
		});
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();
	};
	const wallQuad = (w: Wall): P3[] => [
		{ x: w.a.x, y: w.a.y, z: 0 },
		{ x: w.b.x, y: w.b.y, z: 0 },
		{ x: w.b.x, y: w.b.y, z: wh },
		{ x: w.a.x, y: w.a.y, z: wh },
	];
	const walls = tubWalls();
	const isNear = (w: Wall) => w.n.x * toward.x + w.n.y * toward.y > 0;

	poly(
		[
			{ x: minX, y: minY, z: 0 },
			{ x: maxX, y: minY, z: 0 },
			{ x: maxX, y: maxY, z: 0 },
			{ x: minX, y: maxY, z: 0 },
		],
		WALL.floor,
	);
	for (const w of walls) {
		if (isNear(w)) continue;
		const lit = -(w.n.x * light.x + w.n.y * light.y) > 0.1;
		poly(wallQuad(w), lit ? WALL.wall : WALL.wallShade);
	}

	const tris: { depth: number; fill: string; p: [P3, P3, P3] }[] = [];
	const cellX = (i: number) => minX + i * fluid.dx;
	const cellY = (j: number) => minY + j * fluid.dy;
	for (let j = 0; j < fluid.ny; j++) {
		for (let i = 0; i < fluid.nx; i++) {
			const z00 = cornerHeight(fluid, i, j);
			const z10 = cornerHeight(fluid, i + 1, j);
			const z11 = cornerHeight(fluid, i + 1, j + 1);
			const z01 = cornerHeight(fluid, i, j + 1);
			if (z00 + z10 + z11 + z01 < 0.008) continue;
			const p00 = { x: cellX(i), y: cellY(j), z: z00 };
			const p10 = { x: cellX(i + 1), y: cellY(j), z: z10 };
			const p11 = { x: cellX(i + 1), y: cellY(j + 1), z: z11 };
			const p01 = { x: cellX(i), y: cellY(j + 1), z: z01 };
			for (const p of [
				[p00, p10, p11],
				[p00, p11, p01],
			] as [P3, P3, P3][]) {
				tris.push({
					depth: (depth(p[0]) + depth(p[1]) + depth(p[2])) / 3,
					fill: shadeTri(p[0], p[1], p[2], wh, light, liquid),
					p,
				});
			}
		}
	}
	tris.sort((a, b) => a.depth - b.depth);
	for (const t of tris) {
		poly(t.p, t.fill);
		ctx.strokeStyle = t.fill;
		ctx.lineWidth = 0.6;
		ctx.stroke();
	}

	ctx.strokeStyle = "rgba(242, 255, 208, 0.85)";
	ctx.lineWidth = Math.max(1, o.scale * 0.025);
	for (const w of walls) {
		if (isNear(w)) continue;
		drawMeniscusEdge(ctx, fluid, toScreen, wh, w);
	}

	if (o.nearWalls) {
		for (const w of walls) {
			if (!isNear(w)) continue;
			const lit = w.n.x * light.x + w.n.y * light.y > 0.1;
			const quad = wallQuad(w);
			poly(quad, lit ? WALL.wall : WALL.wallShade);
			ctx.lineWidth = Math.max(1, o.scale * 0.02);
			ctx.strokeStyle = INK;
			ctx.stroke();
		}
	}

	ctx.lineWidth = Math.max(1.5, o.scale * 0.04);
	ctx.strokeStyle = INK;
	ctx.lineJoin = "round";
	ctx.beginPath();
	for (const [k, w] of walls.entries()) {
		const a = toScreen(w.a.x, w.a.y, wh);
		if (k === 0) ctx.moveTo(a.sx, a.sy);
		else ctx.lineTo(a.sx, a.sy);
	}
	ctx.closePath();
	ctx.stroke();
}

function fitTransform(
	cssW: number,
	cssH: number,
	wallHeight: number,
	pad: number,
) {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const x of [TRUNK_LOCAL.minX, TRUNK_LOCAL.maxX])
		for (const y of [TRUNK_LOCAL.minY, TRUNK_LOCAL.maxY])
			for (const z of [0, wallHeight]) {
				const p = isoProject(x, y, z);
				minX = Math.min(minX, p.x);
				maxX = Math.max(maxX, p.x);
				minY = Math.min(minY, p.y);
				maxY = Math.max(maxY, p.y);
			}
	const pw = maxX - minX;
	const ph = maxY - minY;
	const scale = Math.min((cssW - pad * 2) / pw, (cssH - pad * 2 - 8) / ph);
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return {
		scale,
		ox: cssW / 2 - cx * scale,
		oy: cssH / 2 + 6 - cy * scale,
	};
}

/** Free-standing isometric tub for the HUD panel and pop-out. */
export function drawTrunkIsometric(
	ctx: CanvasRenderingContext2D,
	fluid: FluidLayer,
	cssW: number,
	cssH: number,
	opts: TrunkDrawOptions = {},
) {
	const pad = opts.pad ?? 22;
	const { scale, ox, oy } = fitTransform(cssW, cssH, fluid.wallHeight, pad);
	const toScreen = (x: number, y: number, z: number) => {
		const p = isoProject(x, y, z);
		return { sx: ox + p.x * scale, sy: oy + p.y * scale };
	};

	ctx.clearRect(0, 0, cssW, cssH);
	drawTubMesh(ctx, fluid, {
		toScreen,
		toward: { x: 1, y: 1 },
		light: SUN,
		scale,
		nearWalls: true,
	});

	if (opts.showVelocityArrows) {
		drawVelocityArrows(ctx, fluid, toScreen, scale, opts.arrowEvery ?? 3);
	}

	if (opts.showCom !== false) {
		const com = fluid.centroidLocal();
		const ci = Math.round((com.x - TRUNK_LOCAL.minX) / fluid.dx);
		const cj = Math.round((com.y - TRUNK_LOCAL.minY) / fluid.dy);
		const cz = cornerHeight(fluid, ci, cj);
		const c = toScreen(com.x, com.y, Math.max(0.02, cz) + 0.02);
		ctx.fillStyle = "#ff3b8f";
		ctx.strokeStyle = INK;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(c.sx, c.sy, 4, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
	}

	if (opts.label) {
		ctx.font = "600 11px Trebuchet MS, system-ui, sans-serif";
		ctx.fillStyle = INK;
		ctx.textAlign = "left";
		ctx.fillText(opts.label, 14, 16);
	}
}

function drawMeniscusEdge(
	ctx: CanvasRenderingContext2D,
	fluid: FluidLayer,
	toScreen: TubProjector,
	wh: number,
	w: Wall,
) {
	const sample = (x: number, y: number) => {
		const ci = Math.round((x - TRUNK_LOCAL.minX) / fluid.dx);
		const cj = Math.round((y - TRUNK_LOCAL.minY) / fluid.dy);
		return Math.min(wh, cornerHeight(fluid, ci, cj) + 0.008);
	};
	const steps = 6;
	ctx.beginPath();
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = w.a.x + (w.b.x - w.a.x) * t;
		const y = w.a.y + (w.b.y - w.a.y) * t;
		const p = toScreen(x, y, sample(x, y));
		if (i === 0) ctx.moveTo(p.sx, p.sy);
		else ctx.lineTo(p.sx, p.sy);
	}
	ctx.stroke();
}

function drawVelocityArrows(
	ctx: CanvasRenderingContext2D,
	fluid: FluidLayer,
	toScreen: TubProjector,
	scale: number,
	every: number,
) {
	const step = Math.max(1, every);
	ctx.lineWidth = 1.5;
	ctx.strokeStyle = "rgba(27, 18, 11, 0.75)";
	ctx.fillStyle = "#1b120b";

	for (let j = 0; j < fluid.ny; j += step) {
		for (let i = 0; i < fluid.nx; i += step) {
			const h = fluid.heightAt(i, j);
			if (h < 0.01) continue;
			const vel = fluid.velocityAt(i, j);
			const sp = Math.hypot(vel.x, vel.y);
			if (sp < 0.04) continue;
			const cx = TRUNK_LOCAL.minX + (i + 0.5) * fluid.dx;
			const cy = TRUNK_LOCAL.minY + (j + 0.5) * fluid.dy;
			const cz = h + 0.015;
			const len = Math.min(0.22, 0.08 + sp * 0.12);
			const tx = cx + (vel.x / sp) * len;
			const ty = cy + (vel.y / sp) * len;
			const a = toScreen(cx, cy, cz);
			const b = toScreen(tx, ty, cz);
			const dx = b.sx - a.sx;
			const dy = b.sy - a.sy;
			const al = Math.hypot(dx, dy) || 1;
			const ux = dx / al;
			const uy = dy / al;
			const head = Math.max(4, scale * 0.04);
			ctx.beginPath();
			ctx.moveTo(a.sx, a.sy);
			ctx.lineTo(b.sx, b.sy);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(b.sx, b.sy);
			ctx.lineTo(
				b.sx - ux * head + uy * head * 0.45,
				b.sy - uy * head - ux * head * 0.45,
			);
			ctx.lineTo(
				b.sx - ux * head - uy * head * 0.45,
				b.sy - uy * head + ux * head * 0.45,
			);
			ctx.closePath();
			ctx.fill();
		}
	}
}
