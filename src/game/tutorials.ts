const KEY = "trunk-slosh-tutorials";

type Flags = {
	welcome?: boolean;
	spill?: boolean;
	handbrake?: boolean;
	turn?: boolean;
	dismissed?: boolean;
};

function load(): Flags {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Flags;
	} catch {
		return {};
	}
}

function save(f: Flags) {
	localStorage.setItem(KEY, JSON.stringify(f));
}

export function tutorialsEnabled(): boolean {
	return !load().dismissed;
}

export function dismissTutorialsForever() {
	save({ ...load(), dismissed: true });
}

export type TutorialHint = "welcome" | "spill" | "handbrake" | "turn" | null;

export function nextTutorialHint(events: {
	spilled: boolean;
	handbrake: boolean;
	highG: boolean;
	elapsed: number;
}): TutorialHint {
	if (!tutorialsEnabled()) return null;
	const f = load();
	if (!f.welcome && events.elapsed < 60) {
		f.welcome = true;
		save(f);
		return "welcome";
	}
	if (events.spilled && !f.spill) {
		f.spill = true;
		save(f);
		return "spill";
	}
	if (events.handbrake && !f.handbrake) {
		f.handbrake = true;
		save(f);
		return "handbrake";
	}
	if (events.highG && !f.turn) {
		f.turn = true;
		save(f);
		return "turn";
	}
	return null;
}

export function tutorialMessage(h: TutorialHint): string {
	if (h === "welcome")
		return "Ease onto the gas. A hard start throws the goo over the tailgate.";
	if (h === "spill")
		return "Liquid over the lip is gone for good — ease off before corners.";
	if (h === "handbrake")
		return "Drift breaks traction; use it to rotate, not to haul cargo.";
	if (h === "turn")
		return "Hard turning shifts weight — slosh hits the outside wall first.";
	return "";
}
