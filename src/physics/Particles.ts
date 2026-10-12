import type { Vec2 } from "../math/vec2";

export type SpillEvent = {
	x: number;
	y: number;
	/** Launch height above the road (m) */
	z: number;
	vx: number;
	vy: number;
	vz: number;
	/** Liquid volume (m³) */
	volume: number;
	/** Ground height the droplet lands on (m). Defaults to 0. */
	groundZ?: number;
};

export type Droplet = {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	volume: number;
	groundZ: number;
};
export type Splat = {
	x: number;
	y: number;
	r: number;
	life: number;
	seed: number;
	z: number;
};
export type Puff = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	life: number;
	maxLife: number;
	z: number;
};
export type Skid = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	strength: number;
	life: number;
	z: number;
};
export type Popup = {
	x: number;
	y: number;
	text: string;
	life: number;
	big: boolean;
};

const G = 9.81;
const DROPLET_VOLUME = 0.002;
/** Thickness of a puddle film on the ground; sets splat radius from volume (m) */
const FILM = 0.0025;
const MAX_SPLAT_R = 1.3;
const MAX_DROPLETS = 500;
const MAX_SPLATS = 240;
const MAX_PUFFS = 140;
const MAX_SKIDS = 900;
export const SPLAT_LIFE = 28;
export const SKID_LIFE = 16;

export class ParticlePool {
	droplets: Droplet[] = [];
	splats: Splat[] = [];
	puffs: Puff[] = [];
	skids: Skid[] = [];
	popups: Popup[] = [];
	/** Liquid that has reached the ground (m³) */
	landedVolume = 0;

	/** Trickles accumulate here until there is enough liquid for a droplet worth drawing */
	private pending: SpillEvent | null = null;

	emit(events: SpillEvent[]) {
		for (const ev of events) {
			const p = this.pending;
			if (p) {
				const w = ev.volume / (p.volume + ev.volume);
				p.x += (ev.x - p.x) * w;
				p.y += (ev.y - p.y) * w;
				p.vx += (ev.vx - p.vx) * w;
				p.vy += (ev.vy - p.vy) * w;
				p.vz += (ev.vz - p.vz) * w;
				p.groundZ =
					(p.groundZ ?? 0) + ((ev.groundZ ?? 0) - (p.groundZ ?? 0)) * w;
				p.volume += ev.volume;
			} else {
				this.pending = { ...ev };
			}
			if (this.pending && this.pending.volume >= DROPLET_VOLUME) {
				this.launch(this.pending);
				this.pending = null;
			}
		}
	}

	private launch(e: SpillEvent) {
		const n = Math.max(1, Math.min(3, Math.floor(e.volume / DROPLET_VOLUME)));
		for (let i = 0; i < n; i++) {
			if (this.droplets.length >= MAX_DROPLETS) {
				const oldest = this.droplets.shift();
				if (oldest) this.land(oldest);
			}
			this.droplets.push({
				x: e.x,
				y: e.y,
				z: e.z,
				vx: e.vx + (Math.random() - 0.5) * 1.2,
				vy: e.vy + (Math.random() - 0.5) * 1.2,
				vz: e.vz + Math.random() * 0.8,
				volume: e.volume / n,
				groundZ: e.groundZ ?? 0,
			});
		}
	}

	addPuff(x: number, y: number, vx: number, vy: number, size: number, z = 0) {
		if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
		const maxLife = 0.7 + Math.random() * 0.6;
		this.puffs.push({ x, y, vx, vy, r: size, life: maxLife, maxLife, z });
	}

	addSkid(from: Vec2, to: Vec2, strength: number, z = 0) {
		if (this.skids.length >= MAX_SKIDS) this.skids.shift();
		this.skids.push({
			x1: from.x,
			y1: from.y,
			x2: to.x,
			y2: to.y,
			strength,
			life: SKID_LIFE,
			z,
		});
	}

	addPopup(x: number, y: number, text: string, big = false) {
		this.popups.push({ x, y, text, life: big ? 1.4 : 1.0, big });
	}

	step(dt: number) {
		for (let i = this.droplets.length - 1; i >= 0; i--) {
			const d = this.droplets[i];
			const drag = 1 - 0.08 * dt;
			d.vx *= drag;
			d.vy *= drag;
			d.vz -= G * dt;
			d.x += d.vx * dt;
			d.y += d.vy * dt;
			d.z += d.vz * dt;
			if (d.z <= d.groundZ) {
				d.z = d.groundZ;
				this.land(d);
				this.droplets.splice(i, 1);
			}
		}

		for (let i = this.splats.length - 1; i >= 0; i--) {
			this.splats[i].life -= dt;
			if (this.splats[i].life <= 0) this.splats.splice(i, 1);
		}

		for (let i = this.puffs.length - 1; i >= 0; i--) {
			const p = this.puffs[i];
			p.life -= dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vx *= 1 - 2.5 * dt;
			p.vy *= 1 - 2.5 * dt;
			p.r += dt * 1.1;
			if (p.life <= 0) this.puffs.splice(i, 1);
		}

		for (let i = this.skids.length - 1; i >= 0; i--) {
			this.skids[i].life -= dt;
			if (this.skids[i].life <= 0) this.skids.splice(i, 1);
		}

		for (let i = this.popups.length - 1; i >= 0; i--) {
			this.popups[i].life -= dt;
			if (this.popups[i].life <= 0) this.popups.splice(i, 1);
		}
	}

	private land(d: Droplet) {
		this.landedVolume += d.volume;
		const r = Math.sqrt(d.volume / (Math.PI * FILM));
		for (
			let i = this.splats.length - 1;
			i >= Math.max(0, this.splats.length - 16);
			i--
		) {
			const s = this.splats[i];
			if (
				s.r < MAX_SPLAT_R &&
				Math.hypot(s.x - d.x, s.y - d.y) < s.r + r * 0.8
			) {
				const area = s.r * s.r + r * r;
				const w = (r * r) / area;
				s.x += (d.x - s.x) * w;
				s.y += (d.y - s.y) * w;
				s.r = Math.min(MAX_SPLAT_R, Math.sqrt(area));
				s.z += (d.groundZ - s.z) * w;
				s.life = SPLAT_LIFE;
				return;
			}
		}
		if (this.splats.length >= MAX_SPLATS) this.splats.shift();
		this.splats.push({
			x: d.x,
			y: d.y,
			r: Math.min(MAX_SPLAT_R, r),
			life: SPLAT_LIFE,
			seed: Math.random(),
			z: d.groundZ,
		});
	}

	clear() {
		this.pending = null;
		this.droplets.length = 0;
		this.splats.length = 0;
		this.puffs.length = 0;
		this.skids.length = 0;
		this.popups.length = 0;
		this.landedVolume = 0;
	}
}
