import type { FluidLayer } from "../physics/FluidLayer";
import { TRUNK_LOCAL } from "../physics/trunkConstants";
import { isoDepth, isoProject } from "./isoProject";
import { shiftHex } from "./liquidColor";
import { INK } from "./Renderer";

const WALL = {
	wall: "#6a635c",
	wallShade: "#3d3833",
	floor: "#2a2420",
	foam: "#f2ffd0",
};

function liquidPalette(shift: number) {
	return {
		deep: shiftHex("#187020", shift),
		mid: shiftHex("#4ec42c", shift),
		light: shiftHex("#aaf354", shift),
		foam: WALL.foam,
		wall: WALL.wall,
		wallShade: WALL.wallShade,
		floor: WALL.floor,
	};
}

const LIGHT = { x: -0.45, y: -0.55, z: 0.7 };
{
	const l = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);
	LIGHT.x /= l;
	LIGHT.y /= l;
	LIGHT.z /= l;
}

type Tri = {
	p: [
		{ x: number; y: number; z: number },
		{ x: number; y: number; z: number },
		{ x: number; y: number; z: number },
	];
	fill: string;
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
	ax: number,
	ay: number,
	az: number,
	bx: number,
	by: number,
	bz: number,
	cx: number,
	cy: number,
	cz: number,
	wallHeight: number,
	liquid: ReturnType<typeof liquidPalette>,
): string {
	const ux = bx - ax;
	const uy = by - ay;
	const uz = bz - az;
	const vx = cx - ax;
	const vy = cy - ay;
	const vz = cz - az;
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
	const lit = nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z;
	const avgZ = (az + bz + cz) / 3;
	if (avgZ > wallHeight * 0.88) return liquid.foam;
	if (lit > 0.55) return liquid.light;
	if (lit < 0.2) return liquid.deep;
	return liquid.mid;
}

function fitTransform(
	cssW: number,
	cssH: number,
	wallHeight: number,
	pad: number,
) {
	const pts = [
		isoProject(TRUNK_LOCAL.minX, TRUNK_LOCAL.minY, 0),
		isoProject(TRUNK_LOCAL.maxX, TRUNK_LOCAL.maxY, 0),
		isoProject(TRUNK_LOCAL.minX, TRUNK_LOCAL.maxY, wallHeight),
		isoProject(TRUNK_LOCAL.maxX, TRUNK_LOCAL.minY, wallHeight),
	];
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const p of pts) {
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

/** Isometric tub mesh (shared by HUD panel, pop-out, and in-car sprite). */
export function drawTrunkIsometric(
	ctx: CanvasRenderingContext2D,
	fluid: FluidLayer,
	cssW: number,
	cssH: number,
	opts: TrunkDrawOptions = {},
) {
	const pad = opts.pad ?? 22;
	const liquid = liquidPalette(fluid.colorShift);
	const { scale, ox, oy } = fitTransform(cssW, cssH, fluid.wallHeight, pad);
	const toScreen = (x: number, y: number, z: number) => {
		const p = isoProject(x, y, z);
		return { sx: ox + p.x * scale, sy: oy + p.y * scale };
	};

	ctx.clearRect(0, 0, cssW, cssH);

	const tris: { depth: number; tri: Tri }[] = [];
	const addTri = (tri: Tri) => {
		const d =
			(isoDepth(tri.p[0].x, tri.p[0].y, tri.p[0].z) +
				isoDepth(tri.p[1].x, tri.p[1].y, tri.p[1].z) +
				isoDepth(tri.p[2].x, tri.p[2].y, tri.p[2].z)) /
			3;
		tris.push({ depth: d, tri });
	};

	const cellX = (i: number) => TRUNK_LOCAL.minX + i * fluid.dx;
	const cellY = (j: number) => TRUNK_LOCAL.minY + j * fluid.dy;
	const wh = fluid.wallHeight;
	const { minX, maxX, minY, maxY } = TRUNK_LOCAL;

	addTri({
		p: [
			{ x: minX, y: minY, z: 0 },
			{ x: maxX, y: minY, z: 0 },
			{ x: maxX, y: maxY, z: 0 },
		],
		fill: liquid.floor,
	});
	addTri({
		p: [
			{ x: minX, y: minY, z: 0 },
			{ x: maxX, y: maxY, z: 0 },
			{ x: minX, y: maxY, z: 0 },
		],
		fill: liquid.floor,
	});

	const wallSeg = (
		ax: number,
		ay: number,
		bx: number,
		by: number,
		shadeSide: boolean,
	) => {
		const fill = shadeSide ? liquid.wallShade : liquid.wall;
		addTri({
			p: [
				{ x: ax, y: ay, z: 0 },
				{ x: bx, y: by, z: 0 },
				{ x: bx, y: by, z: wh },
			],
			fill,
		});
		addTri({
			p: [
				{ x: ax, y: ay, z: 0 },
				{ x: bx, y: by, z: wh },
				{ x: ax, y: ay, z: wh },
			],
			fill,
		});
	};
	wallSeg(minX, minY, maxX, minY, false);
	wallSeg(maxX, minY, maxX, maxY, true);
	wallSeg(maxX, maxY, minX, maxY, false);
	wallSeg(minX, maxY, minX, minY, true);

	for (let j = 0; j < fluid.ny; j++) {
		for (let i = 0; i < fluid.nx; i++) {
			const x0 = cellX(i);
			const x1 = cellX(i + 1);
			const y0 = cellY(j);
			const y1 = cellY(j + 1);
			const z00 = cornerHeight(fluid, i, j);
			const z10 = cornerHeight(fluid, i + 1, j);
			const z11 = cornerHeight(fluid, i + 1, j + 1);
			const z01 = cornerHeight(fluid, i, j + 1);
			if (z00 + z10 + z11 + z01 < 0.008) continue;
			const p00 = { x: x0, y: y0, z: z00 };
			const p10 = { x: x1, y: y0, z: z10 };
			const p11 = { x: x1, y: y1, z: z11 };
			const p01 = { x: x0, y: y1, z: z01 };
			addTri({
				p: [p00, p10, p11],
				fill: shadeTri(
					p00.x,
					p00.y,
					p00.z,
					p10.x,
					p10.y,
					p10.z,
					p11.x,
					p11.y,
					p11.z,
					wh,
					liquid,
				),
			});
			addTri({
				p: [p00, p11, p01],
				fill: shadeTri(
					p00.x,
					p00.y,
					p00.z,
					p11.x,
					p11.y,
					p11.z,
					p01.x,
					p01.y,
					p01.z,
					wh,
					liquid,
				),
			});
		}
	}

	tris.sort((a, b) => a.depth - b.depth);
	for (const { tri } of tris) {
		ctx.beginPath();
		const a = toScreen(tri.p[0].x, tri.p[0].y, tri.p[0].z);
		ctx.moveTo(a.sx, a.sy);
		for (let k = 1; k < 3; k++) {
			const p = toScreen(tri.p[k].x, tri.p[k].y, tri.p[k].z);
			ctx.lineTo(p.sx, p.sy);
		}
		ctx.closePath();
		ctx.fillStyle = tri.fill;
		ctx.fill();
	}

	if (opts.showVelocityArrows) {
		drawVelocityArrows(ctx, fluid, toScreen, scale, opts.arrowEvery ?? 3);
	}

	drawMeniscus(ctx, fluid, toScreen, wh);

	ctx.lineWidth = 2;
	ctx.strokeStyle = INK;
	ctx.lineJoin = "round";
	const rim = (ax: number, ay: number, bx: number, by: number) => {
		const a = toScreen(ax, ay, wh);
		const b = toScreen(bx, by, wh);
		ctx.beginPath();
		ctx.moveTo(a.sx, a.sy);
		ctx.lineTo(b.sx, b.sy);
		ctx.stroke();
	};
	rim(minX, minY, maxX, minY);
	rim(maxX, minY, maxX, maxY);
	rim(maxX, maxY, minX, maxY);
	rim(minX, maxY, minX, minY);
	ctx.lineWidth = 3;
	rim(maxX, minY, maxX, maxY);

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

function drawMeniscus(
	ctx: CanvasRenderingContext2D,
	fluid: FluidLayer,
	toScreen: (x: number, y: number, z: number) => { sx: number; sy: number },
	wh: number,
) {
	ctx.strokeStyle = "rgba(242, 255, 208, 0.85)";
	ctx.lineWidth = 1.25;
	const { minX, maxX, minY, maxY } = TRUNK_LOCAL;
	const sample = (x: number, y: number) => {
		const ci = Math.round((x - TRUNK_LOCAL.minX) / fluid.dx);
		const cj = Math.round((y - TRUNK_LOCAL.minY) / fluid.dy);
		return Math.min(wh, cornerHeight(fluid, ci, cj) + 0.008);
	};
	const edge = (ax: number, ay: number, bx: number, by: number) => {
		const steps = 6;
		ctx.beginPath();
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const x = ax + (bx - ax) * t;
			const y = ay + (by - ay) * t;
			const z = sample(x, y);
			const p = toScreen(x, y, z);
			if (i === 0) ctx.moveTo(p.sx, p.sy);
			else ctx.lineTo(p.sx, p.sy);
		}
		ctx.stroke();
	};
	edge(minX, minY, maxX, minY);
	edge(maxX, minY, maxX, maxY);
	edge(maxX, maxY, minX, maxY);
	edge(minX, maxY, minX, minY);
}

function drawVelocityArrows(
	ctx: CanvasRenderingContext2D,
	fluid: FluidLayer,
	toScreen: (x: number, y: number, z: number) => { sx: number; sy: number },
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
