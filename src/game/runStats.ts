export class RunStats {
	spilledLiters = 0;
	peakSlosh = 0;
	offRoadTime = 0;
	peakG = 0;
	checkpointIndex = 0;
	airborneTime = 0;

	reset() {
		this.spilledLiters = 0;
		this.peakSlosh = 0;
		this.offRoadTime = 0;
		this.peakG = 0;
		this.checkpointIndex = 0;
		this.airborneTime = 0;
	}

	tick(
		dt: number,
		onRoad: boolean,
		g: number,
		slosh: number,
		spillDeltaLiters: number,
		airborne = false,
	) {
		this.spilledLiters += spillDeltaLiters;
		this.peakSlosh = Math.max(this.peakSlosh, slosh);
		this.peakG = Math.max(this.peakG, g);
		if (!onRoad) this.offRoadTime += dt;
		if (airborne) this.airborneTime += dt;
	}
}
