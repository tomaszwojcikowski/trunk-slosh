export type QualityTier = "low" | "medium" | "high";

export type GameSettings = {
	ink: boolean;
	sfx: boolean;
	/** Adaptive score layers (bed / drive / tension / air / hit). */
	music: boolean;
	/** 0…1 master mix level. 1 matches today's audible peak via the bus. */
	masterVolume: number;
	reducedMotion: boolean;
	touchSensitivity: number;
	keyboardRamp: number;
	quality: QualityTier;
	useFluidWorker: boolean;
	cameraPunch: boolean;
};

const KEY = "trunk-slosh-settings";

const DEFAULTS: GameSettings = {
	ink: true,
	sfx: true,
	music: true,
	masterVolume: 1,
	reducedMotion: false,
	touchSensitivity: 1,
	keyboardRamp: 1,
	quality: "high",
	useFluidWorker: false,
	cameraPunch: true,
};

export function loadSettings(): GameSettings {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULTS };
		return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GameSettings>) };
	} catch {
		return { ...DEFAULTS };
	}
}

export function saveSettings(s: GameSettings) {
	localStorage.setItem(KEY, JSON.stringify(s));
}

export function detectDefaultQuality(): QualityTier {
	if (typeof window === "undefined") return "high";
	const coarse = window.matchMedia("(pointer: coarse)").matches;
	const webgl = !!document.createElement("canvas").getContext("webgl");
	if (!webgl) return "low";
	if (coarse) return "medium";
	return "high";
}

export function hatchLevelForQuality(q: QualityTier): 0 | 1 | 2 {
	if (q === "low") return 0;
	if (q === "medium") return 1;
	return 2;
}
