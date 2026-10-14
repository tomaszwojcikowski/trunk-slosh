import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	AudioBus,
	engineFreqFor,
	engineGainFor,
	impactGainFor,
	masterGainFor,
	rollGainFor,
	sloshGainFor,
	softGainRamp,
	softMuteTarget,
	splashGainFor,
} from "./AudioBus";

class FakeParam {
	value = 0;
	targets: number[] = [];
	cancels = 0;
	snaps: number[] = [];
	setTargetAtTime(v: number, _t: number, _c: number) {
		this.targets.push(v);
		this.value = v;
	}
	setValueAtTime(v: number, _t: number) {
		this.snaps.push(v);
		this.value = v;
	}
	cancelScheduledValues(_t: number) {
		this.cancels++;
	}
	exponentialRampToValueAtTime(_v: number, _t: number) {}
}

class FakeNode {
	gain = new FakeParam();
	frequency = new FakeParam();
	Q = new FakeParam();
	type = "";
	buffer: AudioBuffer | null = null;
	loop = false;
	connect() {
		return this;
	}
	start() {
		starts++;
	}
	stop() {}
}

let starts = 0;

class FakeAudioContext {
	currentTime = 0;
	state: AudioContextState = "running";
	sampleRate = 8000;
	destination = {};
	createGain() {
		return new FakeNode();
	}
	createOscillator() {
		return new FakeNode();
	}
	createBiquadFilter() {
		return new FakeNode();
	}
	createDynamicsCompressor() {
		return {
			threshold: new FakeParam(),
			knee: new FakeParam(),
			ratio: new FakeParam(),
			attack: new FakeParam(),
			release: new FakeParam(),
			connect() {
				return this;
			},
		};
	}
	createBuffer() {
		return { getChannelData: () => new Float32Array(8) };
	}
	createBufferSource() {
		return new FakeNode();
	}
	resume() {
		this.state = "running";
		return Promise.resolve();
	}
}

describe("AudioBus", () => {
	beforeEach(() => {
		starts = 0;
		vi.stubGlobal("AudioContext", FakeAudioContext);
	});

	it("arms one continuous slosh layer instead of a new tone per tick", () => {
		const bus = new AudioBus();
		bus.sloshTick(1);
		expect(starts).toBe(0);
		bus.unlock();
		const armed = starts;
		expect(armed).toBeGreaterThan(0);
		bus.sloshTick(1);
		bus.sloshTick(0.4);
		bus.sloshTick(0);
		expect(starts).toBe(armed);
	});

	it("keeps the engine on the same oscillators as speed changes", () => {
		const bus = new AudioBus();
		bus.unlock();
		const armed = starts;
		bus.engineLoad(12, 0.8);
		bus.engineLoad(20, 1);
		bus.surfaceRoll(20, true);
		bus.tireScrub(0);
		expect(starts).toBe(armed);
	});

	it("does not start one-shots while sound is off", () => {
		const bus = new AudioBus();
		bus.enabled = false;
		bus.unlock();
		const armed = starts;
		bus.spillSplash(8);
		bus.sloshTick(1);
		bus.engineLoad(10, 1);
		expect(starts).toBe(armed);
	});

	it("accents the lip once per cooldown and stays quiet when calm", () => {
		const bus = new AudioBus();
		bus.unlock();
		const armed = starts;
		bus.lipAccent(0);
		expect(starts).toBe(armed);
		bus.lipAccent(0.1);
		const once = starts;
		expect(once).toBeGreaterThan(armed);
		bus.lipAccent(0.1);
		expect(starts).toBe(once);
	});

	it("thuds once per cooldown and stays quiet under the impact threshold", () => {
		expect(impactGainFor(24)).toBe(0);
		expect(impactGainFor(50)).toBeGreaterThan(0);
		expect(impactGainFor(50)).toBeLessThanOrEqual(0.3);
		const bus = new AudioBus();
		bus.unlock();
		const armed = starts;
		bus.impactThud(10);
		expect(starts).toBe(armed);
		bus.impactThud(40);
		const once = starts;
		expect(once).toBeGreaterThan(armed);
		bus.impactThud(80);
		expect(starts).toBe(once);
	});

	it("keeps a parked truck silent and a hard throttle loud", () => {
		expect(engineGainFor(0, 0)).toBe(0);
		expect(engineGainFor(22, 1)).toBeGreaterThan(0.25);
	});

	it("raises pitch with speed and throttle", () => {
		expect(engineFreqFor(0, 1)).toBeGreaterThan(engineFreqFor(0, 0));
		expect(engineFreqFor(30, 0.2)).toBeGreaterThan(engineFreqFor(5, 0.2));
	});

	it("scales slosh, splash and sand rumble, and drops them to silence", () => {
		expect(sloshGainFor(0)).toBe(0);
		expect(sloshGainFor(1)).toBeGreaterThan(sloshGainFor(0.2));
		expect(splashGainFor(8)).toBeGreaterThan(splashGainFor(1));
		expect(rollGainFor(0, true)).toBe(0);
		expect(rollGainFor(18, true)).toBeGreaterThan(rollGainFor(18, false));
	});

	it("ramps mute without a cancel-and-snap spike", () => {
		expect(softMuteTarget(false, 1)).toBe(0);
		expect(softMuteTarget(false, 1, true)).toBeCloseTo(0.8, 6);
		expect(masterGainFor(1)).toBeCloseTo(0.8, 6);
		expect(masterGainFor(0)).toBe(0);
		const param = new FakeParam();
		param.value = 0.8;
		softGainRamp(param, 0, 0, 0.05);
		expect(param.cancels).toBe(0);
		expect(param.snaps).toEqual([]);
		expect(param.targets).toEqual([0]);
	});

	it("keeps music voices looping while the groove advances", () => {
		const bus = new AudioBus();
		bus.unlock();
		const armed = starts;
		bus.musicTick({
			bed: 0.6,
			drive: 0.4,
			bass: 0.5,
			lead: 0.4,
			tension: 0.2,
			air: 0,
			hit: 0,
			intensity: 0.3,
			bpm: 100,
		});
		bus.musicTick({
			bed: 0.7,
			drive: 0.8,
			bass: 0.8,
			lead: 0.7,
			tension: 0.9,
			air: 0.5,
			hit: 0.6,
			intensity: 0.8,
			bpm: 128,
		});
		expect(starts).toBe(armed);
	});

	it("silences music when the music toggle is off", () => {
		const bus = new AudioBus();
		bus.music = false;
		bus.unlock();
		const armed = starts;
		bus.musicTick({
			bed: 1,
			drive: 1,
			bass: 1,
			lead: 1,
			tension: 1,
			air: 1,
			hit: 1,
			intensity: 1,
			bpm: 120,
		});
		expect(starts).toBe(armed);
	});
});
