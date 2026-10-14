import { beforeAll } from "vitest";
import { initRapier } from "./rapierInit";

beforeAll(async () => {
	await initRapier();
}, 60_000);
