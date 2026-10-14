/** Web Audio mix. The context is created only inside a user gesture. */

import { impactVoiceFor, windGainFor } from "./windVoice";

/** Loud enough to read as an engine on laptop speakers, silent when parked. */
/** Silent under the collision threshold; otherwise a short thud, capped. */
export function impactGainFor(impact: number): number {
	if (impact < 25) return 0;
	return Math.min(0.3, (impact - 25) * 0.004);
}

export function engineGainFor(speed: number, throttle: number): number {
	const drive = Math.min(1, Math.abs(throttle));
	if (speed <= 0.35 && drive <= 0.02) return 0;
	return Math.min(0.28, 0.07 + drive * 0.16 + Math.min(speed, 40) * 0.0035);
}

/** Fundamental frequency (Hz). Throttle revs it; speed carries it up the range. */
export function engineFreqFor(speed: number, throttle: number): number {
	const drive = Math.min(1, Math.abs(throttle));
	return 46 + Math.min(speed, 42) * 2.4 + drive * 34;
}

/** Continuous liquid layer. Quiet until the surface is actually moving. */
export function sloshGainFor(energy: number): number {
	if (energy < 0.08) return 0;
	return Math.min(0.16, 0.035 + energy * 0.07);
}

export function splashGainFor(liters: number): number {
	return Math.min(0.36, 0.1 + liters * 0.012);
}

/** Road rumble. Sand is louder and is filtered lower by the bus. */
export function rollGainFor(speed: number, sand: boolean): number {
	if (speed < 1.2) return 0;
	const base = Math.min(0.08, (speed - 1.2) * 0.0032);
	return sand ? base * 1.65 : base;
}

/** Master gain from the settings slider. Today's bus peak lived at 0.8. */
export function masterGainFor(volume: number): number {
	return Math.max(0, Math.min(1, volume)) * 0.8;
}

/**
 * Soft mute ramp. Never cancel+snap to zero — that clicks when SFX toggles.
 * Returns the target the param should ease toward.
 */
export function softMuteTarget(enabled: boolean, volume: number): number {
	if (!enabled) return 0;
	return masterGainFor(volume);
}

type GainParam = {
	cancelScheduledValues(t: number): void;
	setValueAtTime(v: number, t: number): void;
	setTargetAtTime(v: number, t: number, c: number): void;
	value: number;
};

/** Ease a gain without a one-frame full-level spike. */
export function softGainRamp(
	param: GainParam,
	target: number,
	t: number,
	timeConstant = 0.06,
) {
	param.setTargetAtTime(Math.max(0, target), t, timeConstant);
}

type Loop = { filter: BiquadFilterNode; gain: GainNode };

export class AudioBus {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private duck: GainNode | null = null;
	private engine: OscillatorNode | null = null;
	private engineBody: OscillatorNode | null = null;
	private engineHarmonic: OscillatorNode | null = null;
	private engineSub: OscillatorNode | null = null;
	private engineFilter: BiquadFilterNode | null = null;
	private engineGain: GainNode | null = null;
	private bodyGain: GainNode | null = null;
	private harmonicGain: GainNode | null = null;
	private subGain: GainNode | null = null;
	private scrub: Loop | null = null;
	private exhaust: Loop | null = null;
	private roll: Loop | null = null;
	private slosh: Loop | null = null;
	private wind: Loop | null = null;
	private noise: AudioBuffer | null = null;
	private armed = false;
	private _enabled = true;
	private _volume = 1;
	private _ducked = false;
	private lastSplash = -1;
	private lastImpact = -1;
	private lastSlosh = -1;
	private welcomed = false;

	get enabled() {
		return this._enabled;
	}

	set enabled(value: boolean) {
		this._enabled = value;
		this.applyMaster();
		if (!value) this.silence();
	}

	get volume() {
		return this._volume;
	}

	set volume(value: number) {
		this._volume = Math.max(0, Math.min(1, value));
		this.applyMaster();
	}

	/** Call from a pointer or key event so the browser allows playback. */
	unlock() {
		this.armed = true;
		this.create();
		this.applyMaster();
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

	/** Duck continuous layers on pause/results. One-shots still route to master. */
	setDucked(ducked: boolean) {
		this._ducked = ducked;
		const ctx = this.ctx;
		if (!ctx || !this.duck) return;
		softGainRamp(this.duck.gain, ducked ? 0 : 1, ctx.currentTime, 0.08);
	}

	idle() {
		this.engineLoad(0, 0);
		this.tireScrub(0);
		this.surfaceRoll(0, false);
		this.surfaceWind(0, false);
		this.sloshTick(0);
	}

	engineLoad(speed: number, throttle: number) {
		const ctx = this.ensure();
		if (
			!ctx ||
			!this.engine ||
			!this.engineBody ||
			!this.engineHarmonic ||
			!this.engineSub ||
			!this.engineGain
		)
			return;
		const t = ctx.currentTime;
		const drive = Math.min(1, Math.abs(throttle));
		const freq = engineFreqFor(speed, throttle);
		const gain = engineGainFor(speed, throttle);
		this.engine.frequency.setTargetAtTime(freq, t, 0.05);
		this.engineBody.frequency.setTargetAtTime(freq * 0.993, t, 0.07);
		this.engineHarmonic.frequency.setTargetAtTime(freq * 2.01, t, 0.05);
		this.engineSub.frequency.setTargetAtTime(freq * 0.5, t, 0.08);
		this.engineFilter?.frequency.setTargetAtTime(
			380 + Math.min(speed, 40) * 18 + drive * 320,
			t,
			0.08,
		);
		softGainRamp(this.engineGain.gain, gain, t, 0.05);
		if (this.bodyGain)
			softGainRamp(this.bodyGain.gain, gain > 0 ? 0.45 : 0, t, 0.05);
		if (this.harmonicGain)
			softGainRamp(this.harmonicGain.gain, gain * 0.22, t, 0.05);
		if (this.subGain) softGainRamp(this.subGain.gain, gain * 0.55, t, 0.06);
		this.exhaust?.filter.frequency.setTargetAtTime(160 + drive * 220, t, 0.05);
		if (this.exhaust)
			softGainRamp(
				this.exhaust.gain.gain,
				Math.min(0.1, gain * (0.25 + drive * 0.45)),
				t,
				0.05,
			);
	}

	tireScrub(amount: number) {
		const ctx = this.ensure();
		if (!ctx || !this.scrub) return;
		const t = ctx.currentTime;
		const scrub = amount < 0.2 ? 0 : Math.min(1, amount);
		this.scrub.filter.frequency.setTargetAtTime(700 + scrub * 900, t, 0.03);
		softGainRamp(this.scrub.gain.gain, scrub * 0.22, t, 0.03);
	}

	/** Continuous contact rumble. Call with the current speed every step so it decays. */
	surfaceRoll(speed: number, sand: boolean) {
		const ctx = this.ensure();
		if (!ctx || !this.roll) return;
		const t = ctx.currentTime;
		this.roll.filter.frequency.setTargetAtTime(sand ? 420 : 980, t, 0.08);
		softGainRamp(this.roll.gain.gain, rollGainFor(speed, sand), t, 0.08);
	}

	/** Desert wind bed. Separate from roll; thinner in the air. */
	surfaceWind(speed: number, airborne: boolean) {
		const ctx = this.ensure();
		if (!ctx || !this.wind) return;
		const t = ctx.currentTime;
		this.wind.filter.frequency.setTargetAtTime(
			airborne ? 1400 : 900 + Math.min(speed, 40) * 12,
			t,
			0.1,
		);
		softGainRamp(this.wind.gain.gain, windGainFor(speed, airborne), t, 0.1);
	}

	impactThud(impact: number, kind?: string | null) {
		const gain = impactGainFor(impact);
		if (gain <= 0) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastImpact < 0.12) return;
		this.lastImpact = t;
		const voice = impactVoiceFor(kind);
		this.tone(ctx, voice.freq, 0.1, gain, t, "sine");
		if (voice.filter)
			this.burst(
				ctx,
				voice.filter,
				0.08,
				Math.min(0.1, gain * 0.35),
				"bandpass",
			);
	}

	spillSplash(liters: number) {
		if (liters < 0.3) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastSplash < 0.09) return;
		this.lastSplash = t;
		const gain = splashGainFor(liters);
		this.tone(ctx, 90 + Math.min(40, liters), 0.16, gain * 0.7, t, "sine");
		this.burst(ctx, 280 + Math.min(640, liters * 18), 0.2, gain, "bandpass");
		if (liters > 4)
			this.burst(ctx, 1400, 0.09, Math.min(0.12, gain * 0.4), "highpass");
	}

	finishSting() {
		const ctx = this.ensure();
		if (!ctx) return;
		this.tone(ctx, 523, 0.18, 0.2, ctx.currentTime);
		this.tone(ctx, 784, 0.24, 0.16, ctx.currentTime + 0.09);
	}

	/** Continuous slosh bed. Energy below the threshold fades it out. */
	sloshTick(energy: number, cutoff = 140) {
		const ctx = this.ensure();
		if (!ctx || !this.slosh) return;
		const t = ctx.currentTime;
		const gain = sloshGainFor(energy);
		this.slosh.filter.frequency.setTargetAtTime(
			cutoff + Math.min(80, energy * 40),
			t,
			0.12,
		);
		softGainRamp(this.slosh.gain.gain, gain, t, 0.1);
	}

	/** One short tone at the lip or on a spill. Calm frames start nothing. */
	lipAccent(gain: number) {
		if (gain <= 0) return;
		const ctx = this.ensure();
		if (!ctx || !this.master) return;
		const t = ctx.currentTime;
		if (t - this.lastSlosh < 0.2) return;
		this.lastSlosh = t;
		this.tone(ctx, 168, 0.07, gain, t, "sine");
	}

	private applyMaster() {
		const ctx = this.ctx;
		if (!ctx || !this.master) return;
		softGainRamp(
			this.master.gain,
			softMuteTarget(this._enabled, this._volume),
			ctx.currentTime,
			0.05,
		);
		if (this.duck)
			softGainRamp(this.duck.gain, this._ducked ? 0 : 1, ctx.currentTime, 0.08);
	}

	private silence() {
		const ctx = this.ctx;
		if (!ctx) return;
		const t = ctx.currentTime;
		const nodes = [
			this.engineGain,
			this.bodyGain,
			this.harmonicGain,
			this.subGain,
			this.scrub?.gain,
			this.exhaust?.gain,
			this.roll?.gain,
			this.slosh?.gain,
			this.wind?.gain,
		];
		for (const node of nodes) {
			if (!node) continue;
			softGainRamp(node.gain, 0, t, 0.05);
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
		master.gain.value = masterGainFor(this._volume);
		this.master = master;

		const compressor = ctx.createDynamicsCompressor();
		compressor.threshold.value = -18;
		compressor.knee.value = 12;
		compressor.ratio.value = 3;
		compressor.attack.value = 0.003;
		compressor.release.value = 0.12;
		compressor.connect(ctx.destination);
		master.connect(compressor);

		const duck = ctx.createGain();
		duck.gain.value = this._ducked ? 0 : 1;
		duck.connect(master);
		this.duck = duck;

		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 420;
		filter.Q.value = 0.6;
		const engineGain = ctx.createGain();
		engineGain.gain.value = 0;
		filter.connect(engineGain);
		engineGain.connect(duck);
		this.engineFilter = filter;
		this.engineGain = engineGain;

		this.engine = this.osc(ctx, "sawtooth", 55, filter);
		const bodyGain = ctx.createGain();
		bodyGain.gain.value = 0;
		bodyGain.connect(filter);
		this.bodyGain = bodyGain;
		this.engineBody = this.osc(ctx, "sawtooth", 54, bodyGain);

		const harmonicGain = ctx.createGain();
		harmonicGain.gain.value = 0;
		harmonicGain.connect(duck);
		this.harmonicGain = harmonicGain;
		this.engineHarmonic = this.osc(ctx, "triangle", 110, harmonicGain);

		const subGain = ctx.createGain();
		subGain.gain.value = 0;
		subGain.connect(duck);
		this.subGain = subGain;
		this.engineSub = this.osc(ctx, "sine", 28, subGain);

		this.scrub = this.loop(ctx, duck, "bandpass", 900, 0.8);
		this.exhaust = this.loop(ctx, duck, "bandpass", 180, 0.7);
		this.roll = this.loop(ctx, duck, "lowpass", 900, 0.4);
		this.slosh = this.loop(ctx, duck, "lowpass", 160, 0.5);
		this.wind = this.loop(ctx, duck, "bandpass", 1100, 0.35);
	}

	private osc(
		ctx: AudioContext,
		type: OscillatorType,
		freq: number,
		dest: AudioNode,
	) {
		const node = ctx.createOscillator();
		node.type = type;
		node.frequency.value = freq;
		node.connect(dest);
		node.start();
		return node;
	}

	private loop(
		ctx: AudioContext,
		dest: AudioNode,
		type: BiquadFilterType,
		freq: number,
		q: number,
	): Loop {
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = freq;
		filter.Q.value = q;
		const gain = ctx.createGain();
		gain.gain.value = 0;
		const src = ctx.createBufferSource();
		src.buffer = this.noiseBuffer(ctx);
		src.loop = true;
		src.connect(filter);
		filter.connect(gain);
		gain.connect(dest);
		src.start();
		return { filter, gain };
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
		if (type === "sine")
			osc.frequency.exponentialRampToValueAtTime(48, when + dur);
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
