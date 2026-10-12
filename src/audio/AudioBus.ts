/** Web Audio mix. The context is created only inside a user gesture. */

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
		if (!this._enabled) this.silence();
		if (this.ctx?.state === "suspended") void this.ctx.resume();
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
		const moving = speed > 0.6 || drive > 0.08;
		const freq = 48 + Math.min(speed, 40) * 2.4 + drive * 28;
		const gain = moving
			? Math.min(0.07, 0.012 + drive * 0.04 + speed * 0.0008)
			: 0;
		this.engine.frequency.setTargetAtTime(freq, t, 0.06);
		this.engineHarmonic.frequency.setTargetAtTime(freq * 2, t, 0.06);
		this.engineFilter?.frequency.setTargetAtTime(
			220 + Math.min(speed, 40) * 14 + drive * 180,
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
		this.scrubGain.gain.setTargetAtTime(scrub * 0.09, t, 0.03);
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
			180 + Math.min(500, liters * 18),
			0.16,
			Math.min(0.12, 0.04 + liters * 0.004),
			"bandpass",
		);
	}

	finishSting() {
		const ctx = this.ensure();
		if (!ctx) return;
		this.tone(ctx, 523, 0.16, 0.06, ctx.currentTime);
		this.tone(ctx, 784, 0.22, 0.05, ctx.currentTime + 0.09);
	}

	sloshTick(energy: number) {
		if (energy < 0.15) return;
		const ctx = this.ensure();
		if (!ctx) return;
		const t = ctx.currentTime;
		if (t - this.lastSlosh < 0.18) return;
		this.lastSlosh = t;
		this.tone(
			ctx,
			140 + Math.min(80, energy * 30),
			0.07,
			Math.min(0.03, 0.008 * energy),
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
		filter.frequency.value = 320;
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
