import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	AudioBus,
	engineFreqFor,
	engineGainFor,
	impactGainFor,
	rollGainFor,
	sloshGainFor,
	splashGainFor,
} from "./AudioBus";

class FakeParam {
	value = 0;
	setTargetAtTime(_v: number, _t: number, _c: number) {}
	setValueAtTime(v: number, _t: number) {
		this.value = v;
	}
	cancelScheduledValues(_t: number) {}
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
});
