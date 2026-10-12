const KEY = "trunk-slosh-tutorials";

type Flags = {
	welcome?: boolean;
	spill?: boolean;
	handbrake?: boolean;
	turn?: boolean;
	grade?: boolean;
	jump?: boolean;
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

export type TutorialHint =
	| "welcome"
	| "spill"
	| "handbrake"
	| "turn"
	| "grade"
	| "jump"
	| null;

export function nextTutorialHint(events: {
	spilled: boolean;
	handbrake: boolean;
	highG: boolean;
	onGrade: boolean;
	airborne: boolean;
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
	if (events.onGrade && !f.grade) {
		f.grade = true;
		save(f);
		return "grade";
	}
	if (events.airborne && !f.jump) {
		f.jump = true;
		save(f);
		return "jump";
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
	if (h === "grade") return "A parked tub drains downhill. Creep the slope.";
	if (h === "jump")
		return "The landing hits through the impact thud. Keep the goo in the bed.";
	return "";
}
