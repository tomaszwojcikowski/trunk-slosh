import type { FluidLayer } from "../physics/FluidLayer";
import { drawTrunkIsometric } from "./trunkMeshDraw";

export class TrunkIsoView {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private cssW = 220;
	private cssH = 180;
	visible = true;
	expanded = false;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("2d context required");
		this.ctx = ctx;
	}

	resize(cssW: number, cssH: number, dpr: number) {
		this.cssW = cssW;
		this.cssH = cssH;
		this.canvas.width = Math.round(cssW * dpr);
		this.canvas.height = Math.round(cssH * dpr);
		this.canvas.style.width = `${cssW}px`;
		this.canvas.style.height = `${cssH}px`;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	draw(fluid: FluidLayer, force = false, large = false) {
		if (!this.visible && !force) return;
		drawTrunkIsometric(this.ctx, fluid, this.cssW, this.cssH, {
			label: large
				? "Tub — isometric slosh view"
				: "Tub (iso) · click to enlarge",
			showVelocityArrows: true,
			arrowEvery: large ? 2 : 3,
			pad: large ? 28 : 22,
		});
	}
}
