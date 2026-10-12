/** Web Audio mix. The context is created only inside a user gesture. */

/** Loud enough to read as an engine on laptop speakers, silent when parked. */
/** Silent under the collision threshold; otherwise a short thud, capped. */
export function impactGainFor(impact: number): number {
	if (impact < 25) return 0;
	return Math.min(0.3, (impact - 25) * 0.004);
}

export function engineGainFor(speed: number, throttle: number): number {
	const drive = Math.min(1, Math.abs(throttle));
	if (speed <= 0.35 && drive <= 0.02) return 0;
	return Math.min(0.34, 0.09 + drive * 0.2 + Math.min(speed, 40) * 0.004);
}

export class AudioBus {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private engine: OscillatorNode | null = null;
	private engineHarmonic: OscillatorNode | null = null;
	private engineFilter: BiquadFilterNode | null = null;
	private engineGain: GainNode | null = null;
	private harmonicGain: GainNode | null = null;
	private scrub: AudioBufferSourceNode | null = null;
	private scrubFilter: BiquadFilterNode | null = null;
	private scrubGain: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private armed = false;
	private _enabled = true;
	private lastSlosh = -1;
	private lastSplash = -1;
	private lastImpact = -1;
	private welcomed = false;

	get enabled() {
		return this._enabled;
	}

	set enabled(value: boolean) {
		this._enabled = value;
		if (!value) this.silence();
	}

	/** Call from a pointer or key event so the browser allows playback. */
	unlock() {
		this.armed = true;
		this.create();
		if (!this._enabled) {
			this.silence();
			return;
		}
		const ctx = this.ctx;
		if (!ctx) return;
		if (ctx.state === "suspended") void ctx.resume();
		if (!this.welcomed && this.master) {
			this.welcomed = true;
			this.tone(ctx, 98, 0.14, 0.12, ctx.currentTime, "sawtooth");
		}
	}

	idle() {
		this.engineLoad(0, 0);
		this.tireScrub(0);
	}

	engineLoad(speed: number, throttle: number) {
		const ctx = this.ensure();
		if (!ctx || !this.engine || !this.engineHarmonic || !this.engineGain)
			return;
		const t = ctx.currentTime;
		const drive = Math.min(1, Math.abs(throttle));
		const freq = 52 + Math.min(speed, 40) * 3.1 + drive * 36;
		const gain = engineGainFor(speed, throttle);
		this.engine.frequency.setTargetAtTime(freq, t, 0.06);
		this.engineHarmonic.frequency.setTargetAtTime(freq * 2, t, 0.06);
		this.engineFilter?.frequency.setTargetAtTime(
			420 + Math.min(speed, 40) * 22 + drive * 280,
			t,
			0.08,
		);
		this.engineGain.gain.setTargetAtTime(gain, t, 0.05);
		this.harmonicGain?.gain.setTargetAtTime(gain * 0.22, t, 0.05);
	}

	tireScrub(amount: number) {
		const ctx = this.ensure();
		if (!ctx || !this.scrub || !this.scrubGain || !this.scrubFilter) return;
		const t = ctx.currentTime;
		const scrub = amount < 0.2 ? 0 : Math.min(1, amount);
		this.scrubFilter.frequency.setTargetAtTime(700 + scrub * 900, t, 0.03);
		this.scrubGain.gain.setTargetAtTime(scrub * 0.28, t, 0.03);
	}

	impactThud(impact: number) {
		const gain = impactGainFor(impact);
		if (gain <= 0) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastImpact < 0.12) return;
		this.lastImpact = t;
		this.tone(ctx, 68, 0.1, gain, t, "sine");
	}

	spillSplash(liters: number) {
		if (liters < 0.3) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastSplash < 0.09) return;
		this.lastSplash = t;
		this.burst(
			ctx,
			240 + Math.min(700, liters * 22),
			0.22,
			Math.min(0.34, 0.16 + liters * 0.012),
			"bandpass",
		);
	}

	finishSting() {
		const ctx = this.ensure();
		if (!ctx) return;
		this.tone(ctx, 523, 0.18, 0.2, ctx.currentTime);
		this.tone(ctx, 784, 0.24, 0.16, ctx.currentTime + 0.09);
	}

	sloshTick(energy: number) {
		if (energy < 0.08) return;
		const ctx = this.ensure();
		if (!ctx) return;
		const t = ctx.currentTime;
		if (t - this.lastSlosh < 0.18) return;
		this.lastSlosh = t;
		this.tone(
			ctx,
			110 + Math.min(90, energy * 40),
			0.12,
			Math.min(0.2, 0.06 + energy * 0.04),
			t,
			"sine",
		);
	}

	private silence() {
		const ctx = this.ctx;
		if (!ctx) return;
		const t = ctx.currentTime;
		for (const node of [this.engineGain, this.harmonicGain, this.scrubGain]) {
			if (!node) continue;
			node.gain.cancelScheduledValues(t);
			node.gain.setValueAtTime(0, t);
		}
	}

	private ensure(): AudioContext | null {
		if (!this.armed) return null;
		this.create();
		if (!this._enabled) return null;
		return this.ctx;
	}

	private create() {
		if (this.ctx || !this.armed) return;
		const ctx = new AudioContext();
		this.ctx = ctx;
		const master = ctx.createGain();
		master.gain.value = 0.9;
		master.connect(ctx.destination);
		this.master = master;

		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 480;
		filter.Q.value = 0.7;
		const engineGain = ctx.createGain();
		engineGain.gain.value = 0;
		filter.connect(engineGain);
		engineGain.connect(master);
		this.engineFilter = filter;
		this.engineGain = engineGain;

		const engine = ctx.createOscillator();
		engine.type = "sawtooth";
		engine.frequency.value = 55;
		engine.connect(filter);
		engine.start();
		this.engine = engine;

		const harmonicGain = ctx.createGain();
		harmonicGain.gain.value = 0;
		harmonicGain.connect(master);
		this.harmonicGain = harmonicGain;
		const harmonic = ctx.createOscillator();
		harmonic.type = "triangle";
		harmonic.frequency.value = 110;
		harmonic.connect(harmonicGain);
		harmonic.start();
		this.engineHarmonic = harmonic;

		const scrubFilter = ctx.createBiquadFilter();
		scrubFilter.type = "bandpass";
		scrubFilter.frequency.value = 900;
		scrubFilter.Q.value = 0.8;
		const scrubGain = ctx.createGain();
		scrubGain.gain.value = 0;
		scrubFilter.connect(scrubGain);
		scrubGain.connect(master);
		this.scrubFilter = scrubFilter;
		this.scrubGain = scrubGain;
		const scrub = ctx.createBufferSource();
		scrub.buffer = this.noiseBuffer(ctx);
		scrub.loop = true;
		scrub.connect(scrubFilter);
		scrub.start();
		this.scrub = scrub;
	}

	private noiseBuffer(ctx: AudioContext): AudioBuffer {
		if (this.noise) return this.noise;
		const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		this.noise = buf;
		return buf;
	}

	private tone(
		ctx: AudioContext,
		freq: number,
		dur: number,
		gain: number,
		when: number,
		type: OscillatorType = "triangle",
	) {
		if (!this.master) return;
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, when);
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		osc.connect(g);
		g.connect(this.master);
		osc.start(when);
		osc.stop(when + dur + 0.02);
	}

	private burst(
		ctx: AudioContext,
		freq: number,
		dur: number,
		gain: number,
		filterType: BiquadFilterType,
	) {
		if (!this.master) return;
		const t = ctx.currentTime;
		const src = ctx.createBufferSource();
		src.buffer = this.noiseBuffer(ctx);
		const filter = ctx.createBiquadFilter();
		filter.type = filterType;
		filter.frequency.value = freq;
		filter.Q.value = 0.7;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(filter);
		filter.connect(g);
		g.connect(this.master);
		src.start(t);
		src.stop(t + dur + 0.02);
	}
}
