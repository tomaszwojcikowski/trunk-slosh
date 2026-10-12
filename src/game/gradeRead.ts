/** Signed percent. Under 2% reads as level. */
export function gradeLabel(grade: number): string {
	if (Math.abs(grade) < 0.02) return "level";
	const pct = Math.round(grade * 100);
	return pct > 0 ? `+${pct}%` : `${pct}%`;
}

export function airborneLabel(airborne: boolean): string {
	return airborne ? "air" : "ground";
}
