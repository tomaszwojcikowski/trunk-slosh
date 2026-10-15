/**
 * Free sample catalog under `/audio`.
 * Music stems are Colorosse Arcade (CC0). SFX mix CC0 packs plus one CC-BY scrub.
 * See `public/audio/ATTRIBUTION.md`.
 */

/** Native tempo of the Colorosse Arcade stems (BPM). */
export const SAMPLE_MUSIC_BPM = 152;

export const MUSIC_URLS = {
	bed: "/audio/music/bed.ogg",
	bass: "/audio/music/bass.ogg",
	drive: "/audio/music/drive.ogg",
	lead: "/audio/music/lead.ogg",
} as const;

export const SFX_URLS = {
	engine: "/audio/sfx/engine.ogg",
	exhaust: "/audio/sfx/exhaust.ogg",
	slosh: "/audio/sfx/slosh.ogg",
	splash: "/audio/sfx/splash.ogg",
	splashHeavy: "/audio/sfx/splash_heavy.ogg",
	lip: "/audio/sfx/lip.ogg",
	wind: "/audio/sfx/wind.ogg",
	roll: "/audio/sfx/roll.ogg",
	rollSand: "/audio/sfx/roll_sand.ogg",
	scrub: "/audio/sfx/scrub.ogg",
	impactSoft: "/audio/sfx/impact_soft.ogg",
	impactMetal: "/audio/sfx/impact_metal.ogg",
	impactWood: "/audio/sfx/impact_wood.ogg",
	impactGeneric: "/audio/sfx/impact_generic.ogg",
	impactPlate: "/audio/sfx/impact_plate.ogg",
	checkpoint: "/audio/sfx/checkpoint.ogg",
	finish: "/audio/sfx/finish.ogg",
	welcome: "/audio/sfx/welcome.ogg",
	musicHit: "/audio/sfx/music_hit.ogg",
} as const;

export type MusicBufferKey = keyof typeof MUSIC_URLS;
export type SfxBufferKey = keyof typeof SFX_URLS;

export type GameAudioBuffers = {
	music: Partial<Record<MusicBufferKey, AudioBuffer>>;
	sfx: Partial<Record<SfxBufferKey, AudioBuffer>>;
};

async function decodeUrl(
	ctx: AudioContext,
	url: string,
): Promise<AudioBuffer | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const raw = await res.arrayBuffer();
		return await ctx.decodeAudioData(raw.slice(0));
	} catch {
		return null;
	}
}

/** Load every catalog entry that the host can decode. Missing files are skipped. */
export async function loadGameAudio(
	ctx: AudioContext,
): Promise<GameAudioBuffers> {
	const music: GameAudioBuffers["music"] = {};
	const sfx: GameAudioBuffers["sfx"] = {};

	await Promise.all([
		...Object.entries(MUSIC_URLS).map(async ([key, url]) => {
			const buf = await decodeUrl(ctx, url);
			if (buf) music[key as MusicBufferKey] = buf;
		}),
		...Object.entries(SFX_URLS).map(async ([key, url]) => {
			const buf = await decodeUrl(ctx, url);
			if (buf) sfx[key as SfxBufferKey] = buf;
		}),
	]);

	return { music, sfx };
}

export function hasMusicStems(buffers: GameAudioBuffers | null): boolean {
	if (!buffers) return false;
	return Boolean(
		buffers.music.bed &&
			buffers.music.bass &&
			buffers.music.drive &&
			buffers.music.lead,
	);
}
