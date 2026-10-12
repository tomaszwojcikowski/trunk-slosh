import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioBus, engineGainFor, impactGainFor } from "./AudioBus";

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

	it("arms on unlock and does not stack a new slosh tone every call", () => {
		const bus = new AudioBus();
		bus.sloshTick(1);
		expect(starts).toBe(0);
		bus.unlock();
		const armed = starts;
		expect(armed).toBeGreaterThan(0);
		bus.sloshTick(1);
		const afterOne = starts;
		expect(afterOne).toBe(armed + 1);
		bus.sloshTick(1);
		expect(starts).toBe(afterOne);
	});

	it("keeps the engine on the same oscillators as speed changes", () => {
		const bus = new AudioBus();
		bus.unlock();
		const armed = starts;
		bus.engineLoad(12, 0.8);
		bus.engineLoad(20, 1);
		expect(starts).toBe(armed);
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
});
