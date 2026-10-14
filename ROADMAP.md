# Trunk Slosh — development roadmap

This document defines **what is shipped today** and **sequenced next phases** for the project. Phases are ordered by dependency: later work assumes earlier milestones are done. There is no calendar estimate; complexity notes describe scope and risk only.

**North star:** a readable, skill-based driving game where liquid physics is the main puzzle — fun on desktop and phone, honest simulation, and a distinctive comic-ink look.

---

## Phase 0 — Baseline (v0.1, shipped)

**Theme:** Playable vertical slice — one desert route, one cargo type, grade-at-finish.

| Area | Shipped capability |
|------|-------------------|
| **Game loop** | Ready → drive → cross finish → S–D grade from cargo kept + time shown |
| **Controls** | WASD + ramped pedals, handbrake, touch pads, `R` / `N`, ink toggle, debug vectors |
| **Track** | Seeded procedural desert centerline, obstacles, decor, start/finish gates |
| **Vehicle** | Rapier3D raycast vehicle (suspension wheels), sand grip, prop collisions; tub fluid still custom |
| **Liquid** | MAC shallow-water grid in tub frame, mass conservation, weir spills, chassis coupling |
| **Spills** | Ballistic droplets, ground puddles, popups, skids, dust puffs |
| **Render** | Isometric art pass + WebGL ink post (edges, cel bands, world hatching, grain); 2D fallback |
| **Perf** | 120 Hz fixed step, mobile resolution budget, `?demo` autopilot |
| **Quality** | Vitest (fluid, vehicle, track, particles, skill vs. spill), GitHub Actions CI + Pages |

**Explicit non-goals in v0.1 (by design):** no run failure / game over from empty tank, no missions or progression, no audio, no persistence, no multiplayer or leaderboards.

---

## Phase 1 — Production foundation

**Theme:** Make the repo and release loop boringly reliable so feature work does not fight tooling.

**Goals**

- Reproducible installs and faster CI feedback.
- Traceable work (issues ↔ phases ↔ acceptance checks).
- Baseline accessibility and SEO for the public Pages site.

**Deliverables**

- [x] Commit `package-lock.json`; CI uses `npm ci` with npm cache enabled.
- [x] Add `npm run typecheck` (or split `tsc --noEmit` from build) for local and CI clarity.
- [x] ESLint + Prettier (or Biome) aligned with existing TypeScript style; run in CI.
- [x] GitHub issue templates: **bug**, **feature**, **physics/rendering**; label set matching phases (`phase-1` … `phase-5`).
- [x] `CONTRIBUTING.md`: branch naming, conventional commits, how to run tests and preview Pages base path.
- [x] Pages meta: Open Graph / Twitter cards, short description, theme color (already partial in `index.html`).
- [x] Document seed in HUD or URL (`?seed=12345`) for bug reports and sharing **read-only** links (no leaderboard yet).

**Acceptance criteria**

- Fresh clone: `npm ci && npm test && npm run build` passes locally and on CI.
- A new contributor can find phase ownership and how to verify a change in under 5 minutes of reading.
- Shared `?seed=` URL reproduces the same track geometry on two browsers.

**Dependencies:** None (starts from Phase 0).

**Risks**

- Lockfile drift if devs mix npm versions — pin Node 22 in `.nvmrc` or `engines` in `package.json`.

---

## Phase 2 — Run structure & player goals

**Theme:** Turn “one endless desert dash” into **runs the player understands and repeats** — still no heavy narrative.

**Goals**

- Clear objectives per run (time, cargo, optional challenges).
- Optional failure / stakes without punishing experimentation (aligns with original “no hard fail yet” — introduce as a **mode**, not default).
- Better onboarding and results screen depth.

**Deliverables**

- [x] **Run modes** (menu or query flags): *Practice* (current rules), *Contract* (lose if cargo &lt; X% at finish), *Time trial* (best time with cargo floor).
- [x] **Daily seed** (UTC date → seed) with fixed ruleset; show seed on intro and results.
- [x] **Local persistence** (`localStorage`): best grade/time per mode for daily seed + personal bests for arbitrary seeds.
- [x] **Pause** (desktop `P`, touch button); blur pauses sim.
- [x] **Results breakdown**: spilled volume (L), peak slosh speed, off-road time, hardest G event — drives learning without extra UI clutter.
- [x] **Tutorial beats**: 3 optional overlay hints (first spill, first handbrake, first tight turn) keyed off events, dismiss forever flag.

**Acceptance criteria**

- Player can complete a daily seed run, see stored best, and share `?seed=` + mode in URL.
- Contract mode can end run early with a clear “cargo lost” screen; Practice unchanged from Phase 0 feel.
- New player sees at least one contextual hint in first 60 s without reading README.

**Dependencies:** Phase 1 (seed in URL, issue labels for mode bugs).

**Risks**

- Mode proliferation — cap at three modes until metrics show need for more.
- `localStorage` privacy — no PII; document clear-data in settings.

---

## Phase 3 — Gameplay depth (medium difficulty → variety)

**Theme:** More **routes and constraints** using existing physics — not new engines unless justified.

**Goals**

- Routes that teach different skills (long straights, switchbacks, choke points).
- Cargo and vehicle variety that changes slosh and handling without breaking conservation tests.

**Deliverables**

- [x] **Track archetypes** from seed bands or explicit picker: *Flats*, *Canyon*, *Boulder field* (parameter sets in `Track` generator).
- [x] **Checkpoints** (optional): must pass segments in order; show segment progress on HUD.
- [x] **Cargo presets**: water (default), *thick* (higher viscosity → damped waves, new `FluidLayer` params), *volatile* (sloshes harder on same accel — tuning + visual).
- [x] **Vehicle presets**: pickup (default), *short wheelbase* (snappier yaw, worse spill tolerance) — data-driven constants file.
- [x] **Obstacle interactions**: barrels that roll when hit (Matter dynamic bodies, capped count); cactus slow-down without instant stop.
- [x] **Difficulty slider** (easy / medium / hard): road width, obstacle density, AI traffic none — maps to generator knobs.

**Acceptance criteria**

- Each archetype appears in ≥20 generated seeds with stable tests (determinism tests extended).
- Thick cargo: volume conservation tests still pass; visibly different slosh in side-by-side `?demo=10` capture.
- Medium difficulty matches original design intent: skilled play keeps &gt;95% on standard seeds; reckless high speed loses measurably (extend skill-vs-spill tests per archetype).

**Dependencies:** Phase 2 (modes + seed sharing for community “hard seed” posts).

**Risks**

- Dynamic barrels + fixed timestep — cap bodies and add perf test budget on low-end mobile.
- Viscosity model may need sub-step or implicit step — prototype behind feature flag.

---

## Phase 4 — Simulation fidelity & performance

**Theme:** Deeper realism **where it changes player decisions**, with headroom for low-end devices.

**Goals**

- Liquid and vehicle coupling remain stable under extreme inputs.
- Simulation cost scales down on weak hardware without changing rules on strong hardware.

**Deliverables**

- [x] **Adaptive fluid grid**: coarser grid when tub quiescent; refine when spilling or high |ω| (document invariants for conservation). *(Quiet tubs pair neighboring MAC faces and take a longer substep. Hot tubs, spills, and high |ω| use every face. Height updates stay conservative via the outflow limiter.)*
- [x] **Optional Web Worker** fluid step (transfer minimal state); main thread vehicle + render; benchmark vs sync path. *(Settings / `?worker=1` integrate one frame behind on a worker. Sync stays the default so replays match. Custom goo stays on the sync path.)*
- [x] **Slosh audio driver**: one-shots from surface wave energy / spill rate (no continuous loop required in Phase 4 — see Phase 5 for full mix).
- [x] **Replay buffer**: record inputs + seed for last run; export JSON for bug reports.
- [x] **Deterministic replay test**: feed recorded inputs → same finish grade within tolerance (golden replay fixture).
- [x] **Sand / off-road**: deeper sink model (speed-dependent drag already partial — unify with track `query`).

**Acceptance criteria**

- 20 existing unit tests green; add replay golden test and at least one perf regression guard (e.g. max ms per 120 steps on CI runner).
- Worker path optional via flag; default path unchanged for Pages deploy until worker proven.
- Reported bug with replay JSON reproduces grade within 1% cargo on maintainer machine.

**Dependencies:** Phase 1 (CI perf job optional); Phase 3 stable mode set.

**Risks**

- Worker serialization of fluid state is large — may need double-buffered compact representation.
- Determinism across browsers for replay may require fixed RNG streams in particles.

---

## Phase 5 — Presentation, audio & identity

**Theme:** **Borderlands-adjacent** readability and juice without unreadable shaders.

**Goals**

- Stronger silhouette and motion at speed; readable liquid in cel shading.
- Sound and micro-feedback reinforce spills and skill.

**Deliverables**

- [x] **Liquid read**: meniscus line, specular band in art pass; shader preserves hue on deep tub shadow.
- [x] **Camera polish**: slight roll into turn, spill-triggered punch-in optional (accessibility off).
- [x] **UI pass**: comic panels for intro/results; animated grade stamp; reduce font flash on mobile.
- [x] **SFX layer**: engine load, tire scrub, spill splash, finish sting (Web Audio, user gesture unlock).
- [x] **Settings panel**: ink on/off, SFX, reduced motion, sensitivity (touch + keyboard ramp).
- [x] **Quality tiers**: auto-detect WebGL + DPR; manual Low / Med / High (disable hatching levels on Low).

**Acceptance criteria**

- Ink-off and Low tier maintain ≥45 FPS on reference mid-tier phone (document device in issue). *(CI: `perf.test.ts` guards 120 fluid steps &lt;250 ms on the runner; track real devices in a `phase-5` issue when available.)*
- Settings persist locally; reduced motion disables shake and the spill punch.
- Liquid level readable at default zoom without debug mode.

**Update:** the “slight roll into turn” deliverable was removed when the camera became fixed isometric. Roll breaks the 30° axes. Shake and the optional spill punch stay.

**Dependencies:** Phase 2 (settings surface); Phase 4 optional for spill-driven audio signal.

**Risks**

- WebGL shader variants multiply — keep single fragment shader with uniforms.
- Audio autoplay policies — gate on first input consistently with “Hit the gas” intro.

---

## Phase 6 — Meta, community & optional online

**Theme:** **Optional** connectivity — game remains fully offline-capable on Pages.

**Goals**

- Lightweight competition and discovery without operating a game server in v1.

**Deliverables**

- [x] **Share card**: PNG or canvas snapshot of results + seed + QR to game URL (client-side only).
- [x] **Ghost replay**: store best local replay; race translucent ghost on same seed (from Phase 4 buffer).
- [x] **Leaderboard stub**: document GitHub Discussions or external form for daily seed screenshots; **or** integrate free tier API (Supabase / Cloudflare Workers) with signed score submit — behind env flag, not required for deploy. *(v0.7: copy a score post and open GitHub Discussions. No API and no secrets.)*
- [x] **Achievements** (local): first S rank, zero-spill finish, win on hard archetype, etc.
- [x] **Modding hook (minimal)**: export `trunkConstants` + fluid params as JSON for “custom goo” sandbox mode.

**Acceptance criteria**

- Default GitHub Pages deploy has zero secrets and full offline play.
- Ghost replay desync &lt;2 m over full run on same seed + inputs.
- Share flow works on mobile Safari and desktop Chrome.

**Dependencies:** Phase 2 (daily seed), Phase 4 (replay), Phase 5 (results UI).

**Risks**

- Online scores attract cheating — if implemented, use server-side validation of replay hash only, not client trust.

---

## Where the game is now

Phases 0–31 are shipped on this line (v0.34.0). Vehicle integration moved to Rapier3D raycast suspension in v0.32.0.

The main view is true isometric. The chase frame eases toward its lookahead and holds the truck in the lower half. The road is a height-following ribbon: flats stay level, canyon routes climb, boulder routes step, bends bank across the width, and a short ramp can leave the ground. A crease marks a boulder rise and the ramp crown. Contact shadows sit on the local ribbon. Easy hills are gentler; medium and hard stay on the current cap. The HUD names cargo, slosh, speed, G, grade, air, route, checkpoints, and time, plus a ghost split when a best is racing beside you. The slosh band uses hysteresis so calm/moving/lip do not chatter. Checkpoints pop. Contract and time-trial cargo bars warn before they fail. Pause opens a card. Spills and lip/danger edges announce to an aria-live region. A gamepad drives the same pedals as the keys. Wheels carry a mark that advances with distance, the cab spring-settles under braking, and a short truck draws the short axles. A hard hit plays an impact thud whose voice follows the prop kind when known.

The pickup has round tires, a raised hood, bumper, grille, lamps, bed rails, and glass, all on `car.z`. The body, hood, and cab take the pitch lift. The tub opening stays on the bed. Rocks are two stages with a crack, cacti have spines, barrels have a lid, and tire stacks have a hub, each at the obstacle’s stored height. Droplets streak along their flight. Dust puffs have a second lobe and fade with life. Splats, skids, and spill popups soften before they leave. The ink pass is one fragment shader: Sobel, five cel bands, world-anchored hatch, a grain uniform that a review capture can freeze, and a vignette. The liquid keeps a lit band that survives cel shading.

The mix is the layered engine (fundamental, detuned body, harmonic, sub, exhaust), road rumble, desert wind, a continuous slosh bed with a cargo cutoff, a lip accent, tire scrub updated every step, and the impact thud. Adaptive music adds bed, drive, tension, air, and hit layers driven by speed, slosh, cargo threat, prop near-miss, airborne, and impacts (Settings → Dynamic music). Master volume lives in Settings; mute and pause duck continuous layers without zipper clicks. Rumble goes quiet in the air and the engine drops the throttle term; wind thins in the air. Grade and jump each have one tutorial hint. Results include airborne time. Easy and hard bests and ghosts use their own storage key. Medium still reads the original mode-and-seed key. Replay blobs stay version 2.

---

## Phase 7 — Frame the isometric drive

**Theme:** Keep the fixed iso axes, and point the frame at the drive.

**Goals**

- The road ahead stays up-screen and the truck stays in the lower half, including through a fast bend.
- A prop whose top is on screen is drawn even when its base is just outside the frame.
- The settings text matches the camera that actually ships.

**Deliverables**

- [x] Screen-space lookahead: convert the chase point through the iso projection before applying zoom, so speed looks ahead *up the screen* rather than only along world +x/+y.
- [x] Pass real heights into the existing projected `inView` test for obstacles, cacti, and flags. Today those callers pass `0`.
- [x] Reduced-motion copy and behavior: shake and spill punch only. No roll control, no roll promise.
- [x] One golden-frame check for `?demo=` (pixel sample or hash with a stated tolerance) so a model or camera change fails CI on purpose.

**Acceptance criteria**

- Over a 10 s `?demo=` run the truck’s screen position stays in the lower half of the frame.
- Turning reduced motion on leaves shake and punch at zero and does not move the camera axes.
- The golden-frame check fails when the camera offset is intentionally wrong, and passes on the current scene.

**Dependencies:** The isometric renderer on `main`.

**Risks**

- Passing a height that is too small still pops the top of a cactus. Use the drawn height, not the collision radius.
- Frame hashes move when the ink shader’s grain changes. Sample a region, or disable grain for the check.

---

## Phase 8 — Grades the liquid can feel

**Theme:** Give the road a height, and let that height move both the truck and the goo.

**Goals**

- Flats stay level. Canyon climbs and drops. Boulder field steps.
- A parked truck on a grade drains toward the downhill lip. That is the new skill.

**Deliverables**

- [x] A height profile on the centerline, pure function of the seed and archetype. Flats stay within a centimeter of z = 0.
- [x] An explicit grade force on the chassis. Leave Matter’s gravity at zero so the tire model stays the integrator.
- [x] Add the grade’s gravity to the fluid pseudo-acceleration (`FluidLayer` already adds −a). A resting tub on a slope shifts its centroid downhill.
- [x] Draw the road as a ribbon that follows the height. Props, puddles, and shadows sit on the local ground height.
- [x] Replay and conservation tests stay valid: height is part of the seed, mass is still conserved.

**Acceptance criteria**

- A canyon fixture has a non-zero grade; a flats fixture does not.
- At rest on that grade, the liquid centroid’s downhill component is positive and covered by a unit test.
- Volume conservation tests still pass with the grade term enabled.
- A `?demo=` frame of a canyon seed shows the road rising, not a single flat stroke.

**Dependencies:** Phase 7 (the frame has to show the rise). The fluid pseudo-force path from Phase 0.

**Risks**

- A steep grade plus the existing weir can empty the tub at rest. Cap the grade so a full tub on the steepest canyon slope stays inside the lip until the truck also accelerates.
- Old replays have no height. Version the replay blob; do not pretend a pre-grade replay matches.

---

## Phase 9 — See the corner before the spill

**Theme:** Iso shows less asphalt than the old top-down view. Give the player the next bend and the slosh, in the HUD.

**Goals**

- The next change of direction is visible without leaving the iso frame.
- Cargo percent and slosh are different reads.
- A gamepad drives the same `DriveInput` as the keys.

**Deliverables**

- [x] A next-bend chevron (or a short screen-space ribbon) aimed at `Track.pointAt` a fixed distance ahead. It uses the iso projection, so it sits on the road.
- [x] A HUD slosh meter fed by `FluidLayer.sloshSpeed`, with thresholds for calm / moving / at the lip.
- [x] Gamepad: left stick steers, right trigger or right stick is the pedal, one button is the handbrake. Fold it into `Input.poll` so Practice, Contract, and Time trial do not grow a second control path.

**Acceptance criteria**

- The chevron’s world target is the centerline point ahead of the truck, and a test covers the aim with a fixed track fixture.
- The slosh meter’s level is a pure function of `sloshSpeed` and is unit-tested at the three thresholds.
- A fake gamepad snapshot and the matching keys produce the same `DriveInput`.

**Dependencies:** Phase 7 for the chevron’s screen position. Phase 2 modes stay as they are.

**Risks**

- The chevron can cover the truck if the lookahead is too short. Keep it on the road ahead, not on the cab.
- Gamepads report triggers differently per browser. Normalize to 0–1 before the pedal ramp.

---

## Phase 10 — Course furniture on the grades

**Theme:** A few placed features that change the line, using the height from Phase 8.

**Goals**

- Banking, a ramp, and a dry wash each change either the slosh or the grip.
- The Phase 4 perf budget still holds.

**Deliverables**

- [x] Banked bends: a lateral grade into the same fluid term as Phase 8, signed by the turn.
- [x] Short ramps: a vertical velocity on the chassis, landing with the existing impact value. Droplets already fly in z.
- [x] Dry washes: a seeded dip with the sand grip, so the slow line and the fast line are different choices.
- [x] A cap on new dynamic bodies so `perf.test.ts` still passes.

**Acceptance criteria**

- A banking fixture shifts the liquid toward the outside of the bend.
- A ramp fixture leaves the ground and lands; the test records airborne time and does not require zero cargo loss.
- The existing 120-step perf guard still passes with a boulder seed that includes a ramp and a wash.

**Dependencies:** Phase 8 grades and the local ground height. Phase 4 perf test.

**Risks**

- Stacking grade, banking, and a ramp in one segment double-counts gravity. Banking replaces the lateral part of the grade on that segment; it does not add a second one.
- Airtime that lasts more than a few tenths of a second fights the tire model. Keep ramps short.

---

## Phase 11 — Motion and impact

**Theme:** The truck’s parts and the mix should respond to the motion the sim already computes.

**Goals**

- Wheels roll, the body pitches under the load transfer that is already in the vehicle model, and a hit has a sound.
- No second physics model for the visuals.

**Deliverables**

- [x] A mark on each wheel (hub or sidewall) advances with distance traveled, including while steering.
- [x] Body pitch and squat read the longitudinal load transfer already computed for the tires. At rest the offset is zero.
- [x] An impact thud scaled by `VehicleSnapshot.impact`, with the same kind of cooldown the spill splash uses, so a scrape does not machine-gun.
- [x] A `?demo=` review capture that actually contains a spill droplet and a dust puff. The last visual passes never caught either on screen.

**Acceptance criteria**

- Wheel angle is a function of distance and is unit-tested, including a zero-speed hold.
- Pitch is zero with zero longitudinal transfer, and it leans the right way under braking in a fixture.
- Impact below the threshold starts no one-shot; above it, two calls inside the cooldown start one.

**Dependencies:** Phase 10 if the thud should read ramp landings; otherwise only the current `impact` field. Can start from Phase 7 in parallel with 8–10, but the landing check waits on Phase 10.

**Risks**

- Pitching the whole chassis visually while the tub mesh stays in truck-local space will shear the liquid. Pitch the body and cab, and keep the tub opening fixed to the bed so the clip still matches.

---

## Phase 12 — Seat the truck on the road

**Theme:** The readable pickup and the graded scene are two drawings. Make one.

**Goals**

- The thicker pickup sits on `car.z`: round tires, a raised hood, bumper, grille, lamps, bed rails, and glass.
- The wheel mark from Phase 11 turns with the round sidewall. Distance still drives `wheelAngle`.
- Pitch lifts the body, the hood, and the cab. Hood stripes and the scoop pitch with the hood.
- Props use the reads from the models pass, drawn at the obstacle’s stored height: a two-stage rock with a crack, cactus spines, a barrel lid, a tire-stack hub.

**Deliverables**

- [x] Bring the models-pass solids onto this tree’s `car.z`, pitch lift, and painter order. The tub opening stays on the bed, with no pitch term, so the clip still matches.
- [x] A sidewall or hub mark advances with `wheelAngle`, including while steering.
- [x] Draw the two-stage rock, cactus spines, barrel lid, and tire hub at `obstacle.z` (and flag poles at their ground height). Collision radii stay as they are.

**Acceptance criteria**

- A fixture projects a parked wheel’s contact at `car.z`, and a canyon truck’s contact follows `heightAt` rather than the ground plane at 0.
- The existing wheel-angle tests still pass, including the zero-speed hold.
- Under braking the nose is lower than the tail, and the tub floor is `car.z + BED_TOP - wallHeight`.
- Flats stay within a centimeter of z = 0. Replay blobs stay version 2.

**Dependencies:** Phase 8 for height, Phase 11 for spin and pitch. The models pass on `main` is the art to bring across.

**Risks**

- Round tires drawn at z = 0 float on a canyon grade. Offset every solid by the stored height.
- Pitching the glass and the hood while the tub mesh stays bed-local shears the liquid if the opening moves. Pitch the body, hood, and cab. Keep the tub opening fixed to the bed.

---

## Phase 13 — Read the grade

**Theme:** Banking and the ramp are already forces. Make them visible, and leave the forces alone.

**Goals**

- A banked bend shows the inside edge higher than the outside by the bank the fluid already uses.
- A boulder step and the ramp read as a crease or a shade step along the ribbon.
- A prop’s shadow meets the ribbon at that prop’s ground height.

**Deliverables**

- [x] Cross-slope the road quad by `bankAt`. Flats and any segment with bank 0 stay level across the width.
- [x] A darker band or a crease along a boulder rise and along the ramp crown, using the height profile that is already there.
- [x] Cast contact shadows on the local ground height. A shadow does not drop onto a neighboring segment’s z.

**Acceptance criteria**

- A banking fixture’s inside edge projects higher than the outside by the amount `bankAt` implies, within a stated tolerance.
- A flats ribbon stays level across its width, within a centimeter.
- Grade force, `liquidBodyAccel`, and replay version stay as they are.
- `perf.test.ts` still passes. Offscreen ribbon segments stay culled.

**Dependencies:** Phase 8 ribbon, Phase 10 bank, ramp, and wash.

**Risks**

- A drawn cross-slope steeper than the sim bank looks like a second force. Draw `bankAt`.
- Filling the whole route was slow enough to miss a screenshot window. Keep the per-segment cull.

---

## Phase 14 — Ink that holds still

**Theme:** One shader, comic at speed, and a capture that does not depend on grain.

**Goals**

- The ink pass stays a single fragment shader. Low, medium, and high hatch tiers stay the current `hatchLevel` 0 / 1 / 2.
- A review capture can freeze grain so a region sample is stable across two frames.
- The liquid keeps a lit band that survives cel shading, using the triangle shade and the foam color already drawn near the lip.

**Deliverables**

- [x] One grain uniform. At 0 the paper grain is a constant. The default stays the current animated grain.
- [x] `?review=juice` and a paused `?demo=` hold can request grain 0 without a second shader.
- [x] Keep the lit liquid color distinct enough that the five cel bands do not fold it into the mid green. The liquid hatch mask still keeps deep-tub hue.

**Acceptance criteria**

- Ink off still shows the isometric scene.
- Hatch level 0 draws no hatch lines.
- Two frames of a paused scene with grain frozen match on a stated region. The Phase 7 check (truck in the lower half) still passes.
- The Low tier still drops hatch levels. It does not add a shader variant.

**Dependencies:** Phase 5 shader, Phase 7 golden frame, Phase 11 review capture.

**Risks**

- A second fragment shader for “capture mode” will drift from the game look. One shader, one uniform.
- Cel banding can crush a thin specular into the mid band. Draw the lit color in the art pass, in a hue the liquid mask already preserves.

---

## Phase 15 — One mix on the graded truck

**Theme:** The layered mix and the impact thud live on different lines. The player should hear both, and every loop should be able to fall silent.

**Goals**

- The engine is a fundamental, a detuned body, a harmonic, a sub, and exhaust noise. Parked gain stays 0.
- Road rumble follows speed, louder and lower on sand. A dry wash already sets the sand flag, so a wash rumbles as sand.
- Scrub, rumble, and the slosh bed are updated every step, including with a zero amount.
- The Phase 11 impact thud stays the landing sound. A landing does not also start a second hit in the same cooldown.

**Deliverables**

- [x] Bring the layered bus across: `engineFreqFor`, `engineGainFor`, `rollGainFor`, `sloshGainFor`. The body layer uses a fixed fraction of the engine gain when the engine is audible, and 0 when it is parked.
- [x] Call `tireScrub`, `surfaceRoll`, and the slosh bed every step. Scrub gain is 0 when the amount is below 0.2.
- [x] Continuous slosh from `sloshSpeed`, silent under the calm threshold (0.08). Add a short lip accent only when the HUD band is “lip” or a spill starts. Calm frames start no one-shot.
- [x] Keep `impactThud` and `impactGainFor`. The cooldown still collapses two hits into one.

**Acceptance criteria**

- Parked `engineGainFor` is 0. Roll gain is 0 below the speed floor. Slosh gain is 0 under 0.08. Impact gain is 0 under 25.
- A scrub update with amount 0 leaves the scrub gain at 0. The same for roll at speed 0 and slosh at energy 0.
- Two `impactThud` calls inside the cooldown start one tone.
- Reduced motion still clears shake and the spill punch only. It leaves the mix playing.

**Dependencies:** Phase 11 thud and the slosh meter bands. The layered bus on `main` is the mix to bring across.

**Risks**

- Sub, exhaust, rumble, and slosh together clip on laptop speakers. Keep the master gain and the per-layer caps from the models pass.
- Calling the old one-shot `sloshTick` on every energetic frame plus the new bed double-counts the tub. The bed is the continuous layer. The accent is lip and spill only.

---

## Phase 16 — Cargo voice and the spill read

**Theme:** Thick and volatile already differ in the tub. They should differ in the ear, and a spill should read as liquid.

**Goals**

- Water keeps the Phase 15 bed. Thick cargo darkens that bed. Volatile cargo brightens it.
- A droplet in the air is a short streak along its velocity. A dust puff is a soft shape with a second lobe, so dust and liquid are different silhouettes.
- `?review=juice` still holds at least one droplet and one puff.

**Deliverables**

- [x] A pure function from cargo preset to slosh-filter cutoff (and, if useful, splash brightness). Water is the current bed. Thick is lower. Volatile is higher. Viscosity and `colorShift` stay on the preset data that already exists.
- [x] Draw each droplet as a teardrop or a short streak along its flight. Keep the volume-based size.
- [x] Draw each puff as two overlapping lobes. The `?review=juice` pause still catches both a droplet and a puff.

**Acceptance criteria**

- The three cargo cutoffs are unit-tested and ordered thick &lt; water &lt; volatile.
- Volume conservation tests still pass for thick cargo. The hue shift tests still pass.
- A `?review=juice` frame shows a non-circular droplet and a two-lobe puff. The scripted brake still produces both.

**Dependencies:** Phase 15 mix, Phase 11 review capture, Phase 3 cargo presets.

**Risks**

- A streak longer than the droplet’s travel in one frame reads as a ribbon. Cap the streak at a fraction of the speed step.
- Changing splash brightness per cargo can hide a small spill. Keep the 0.3 L splash gate from the current bus.

---

## Phase 17 — The truck you picked

**Theme:** The short wheelbase already yaws faster. The drawing should use the same axles.

**Goals**

- Wheel positions and the body length follow `CAR_SPEC.a` and `CAR_SPEC.b`.
- The tub opening stays `TRUNK_LOCAL`. The fluid clip does not move.
- A pickup and a short truck are different silhouettes in one frame. The ghost uses the same preset.

**Deliverables**

- [x] A pure function from the axle distances to the four wheel positions and a body length. Pickup distances stay the current 1.3 m / 1.35 m.
- [x] The renderer uses that function for the tires, the bumper, and the nose and tail of the body. The cab and the tub opening stay put.
- [x] A short ghost is drawn with the short axles.

**Acceptance criteria**

- Pickup wheel positions match the current art within a centimeter.
- Short axles are closer together than pickup, and a unit test locks both.
- Volume conservation and the golden replay still pass. Replay version stays 2.

**Dependencies:** Phase 12 solids. Phase 3 vehicle presets.

**Risks**

- Scaling the whole outline also scales the tub and shears the liquid. Scale the nose and the tail. Leave the bed opening fixed.
- Visual wheels left at 1.3 m on the short truck sit outside the fenders. Use the same `a` and `b` the tire model uses.

---

## Phase 18 — Name the slope

**Theme:** The hill and the jump are already skills. The HUD, the hints, and the results should say so.

**Goals**

- A grade read and an airborne read, taken from the snapshot the sim already has.
- The first time the player sits on a real grade, and the first time the truck leaves the ground, one tutorial line says what the liquid will do.
- The results line includes airborne time. Spill, peak slosh, off-road time, and peak G stay.

**Deliverables**

- [x] `gradeLabel` and `airborneLabel` as pure functions. A grade under a small threshold reads as level.
- [x] HUD slots for those two reads. Reduced motion leaves them visible.
- [x] Two tutorial hints, stored with the existing dismiss-forever flags. The grade hint says a parked tub drains downhill. The jump hint says the landing comes through the impact thud.
- [x] `RunStats` accumulates airborne time, and the results sentence includes it.

**Acceptance criteria**

- The two labels are unit-tested for level, a canyon-sized grade, grounded, and airborne.
- The existing tutorial tests still pass, and a steep-grade event returns the new hint once.
- Grade force, `bankAt`, and replay version stay as they are.

**Dependencies:** Phase 8 grade, Phase 10 airborne time. Phase 2 tutorial flags.

**Risks**

- A hint on every canyon frame covers the slosh meter. Fire once per flag, the same way the spill hint does.
- A raw slope number is hard to read at speed. Use a short word or a signed percent.

---

## Phase 19 — Hills that match the difficulty

**Theme:** Easy, medium, and hard share one canyon and one boulder profile. The hill is part of the difficulty. Medium stays the profile the replay fixture already drives.

**Goals**

- Easy canyon and boulder routes are gentler. Hard stays at today’s cap, and does not get steeper.
- Medium height, grade, ramp, and wash match the current constants.
- An easy best and a hard best on the same seed are different records. Medium bests that are already stored still load.

**Deliverables**

- [x] A difficulty scale on canyon amplitude, boulder rise, and ramp height. Medium is 1. Hard is 1. Easy is lower. The steepest hard grade stays at or under `MAX_CANYON_GRADE`.
- [x] Flats stay within a centimeter of z = 0 at every difficulty.
- [x] Bests and ghosts gain difficulty in the storage key. The old key, which is mode and seed only, remains the medium record.

**Acceptance criteria**

- A medium canyon fixture’s peak grade matches the unscaled sine.
- An easy canyon fixture’s peak grade is lower. A hard one is not above `MAX_CANYON_GRADE`.
- The golden replay (seed 42, medium, flats) still matches. Replay version stays 2.
- Volume conservation still passes. A resting full tub on the steepest hard canyon slope stays inside the lip.

**Dependencies:** Phase 8 profiles. Phase 2 persistence.

**Risks**

- A taller hard ramp makes airtime long enough to fight the tire model. Hard stays at the current ramp.
- Rewriting every storage key would drop medium bests. Only easy and hard use the new key. Medium keeps reading the old one.

---

## Phase 20 — Quiet in the air

**Theme:** The wheels leave the ground. The mix leaves with them. The landing stays the thud from Phase 11.

**Goals**

- While the truck is airborne, road rumble is silent and throttle stops adding engine load.
- Touchdown still starts at most one impact thud inside the cooldown.

**Deliverables**

- [x] `airborneMix` returns zero roll and a throttle-less engine gain while airborne, and returns the inputs unchanged while grounded.
- [x] The game passes `airborne` into that mix every step, including the landing frame.
- [x] This phase does not add the lip accent. The lip accent is the Phase 15 deliverable.

**Acceptance criteria**

- Grounded values pass through. Airborne roll is 0. Airborne engine gain ignores throttle and keeps a residual from speed.
- Two impacts inside the cooldown still start one thud.
- Parked gain on the ground stays 0.

**Dependencies:** Phase 10 airborne flag. The layered bus and the thud from Phase 15.

**Risks**

- Silencing the engine for a whole jump makes a short ramp feel like a stall. Drop the throttle term and keep a quiet residual from speed.
- Skipping the rumble call on the landing frame leaves the last airborne gain stuck. Call rumble every step.

---

## Phase 21 — Spring the pitch

**Theme:** The cab already pitches from longitudinal load transfer. It should settle, not snap.

**Goals**

- Visual pitch is a spring-damper toward the Phase 11 target from `pitchFromLongAccel`.
- A hard brake dips the nose and returns. A hard accel lifts it and returns.
- The tub opening stays bed-fixed. Tire forces and `liquidBodyAccel` stay as they are.

**Deliverables**

- [x] A pure `settlePitch(current, target, dt, …)` (or equivalent) with unit-tested stiffness and damping. Zero target decays toward level.
- [x] The renderer (or the snapshot consumer) uses the settled pitch for body, hood, and cab lift. The tub opening still ignores pitch.
- [x] Reduced motion skips overshoot: pitch tracks the target without a spring, or holds the undamped value. Shake and spill punch rules stay as they are.

**Acceptance criteria**

- A step to a non-zero target overshoots at most once and settles within a stated tolerance inside a few tenths of a second at 120 Hz.
- Zero longitudinal transfer still ends at pitch 0.
- Existing `pitchFromLongAccel` and wheel-angle tests still pass. Replay version stays 2.

**Dependencies:** Phase 11 pitch. Phase 12 solids that take the pitch lift.

**Risks**

- A soft spring lags a short braking pulse so the nose never dips. Stiffness must still read a hard stop in under half a second.
- Applying settle to the tub opening shears the liquid clip. Keep the opening on the bed.

---

## Phase 22 — Soft endings for dust and rubber

**Theme:** Spill juice already has the right silhouettes. The last frames should fade, not pop.

**Goals**

- A dust puff shrinks and fades from `life / maxLife`.
- A ground splat soaks out with alpha from remaining life.
- A skid mark softens before it is removed. A spill popup rises then fades.

**Deliverables**

- [x] Pure helpers for puff scale/alpha, splat alpha, skid alpha, and popup offset/alpha from life (and `maxLife` where it exists). Unit-tested at full life, mid life, and zero.
- [x] The isometric draw path uses those helpers. Droplet streaks from Phase 16 stay velocity-capped.
- [x] Pool caps and lifetimes (`SPLAT_LIFE`, `SKID_LIFE`, puff `maxLife`) stay unless a test proves a pop. Volume conservation is unchanged.

**Acceptance criteria**

- At `life === 0` every helper returns zero alpha (or zero scale). At full life, alpha is at the current full value.
- `?review=juice` still shows a non-circular droplet and a two-lobe puff.
- Particle pool tests still pass. Replay version stays 2.

**Dependencies:** Phase 11 particles, Phase 16 droplet/puff silhouettes.

**Risks**

- Fading by skipping draw until mid-life hides small spills. Fade alpha, keep the splat until life hits zero.
- Per-frame path allocation for curves will show up in the fluid step budget. Keep helpers allocation-free.

---

## Phase 23 — A mixer the player can trust

**Theme:** The layered mix is audible. Turning it down, pausing, or muting should not click.

**Goals**

- A master volume control in Settings, persisted with the other display settings.
- Enabling or disabling SFX ramps gains instead of snapping to zero.
- Pause and the results card duck continuous layers. One-shots stay gated by the existing cooldowns.

**Deliverables**

- [x] `settings.masterVolume` (0…1, default near today’s fixed master). The bus applies it on the master gain every step the mix runs.
- [x] Soft mute: SFX off and `idle()` ramp continuous gains toward 0 with `setTargetAtTime` (or equivalent). No `cancelScheduledValues` snap to 0 on the audible path.
- [x] Duck engine, exhaust, roll, scrub, and slosh while paused or on the results overlay. Finish sting and impact thud still play when SFX is on.
- [x] Optional: a DynamicsCompressorNode on the master so stacked layers do not clip on laptop speakers. Caps from Phase 15 stay as a backstop.

**Acceptance criteria**

- Volume 0 is silent with SFX still checked. Volume 1 matches or stays under today’s peak within a stated tolerance.
- Toggling SFX off then on does not produce a one-frame full-gain spike in a unit test of the ramp helper.
- Reduced motion still clears shake and punch only. It leaves the mix playing when not ducked by pause.

**Dependencies:** Phase 15 layered bus. Phase 2 pause and results. Phase 5 settings persistence.

**Risks**

- Ducking the finish sting with the results overlay swallows the reward. Duck continuous layers only.
- A compressor with a slow release makes the next throttle surge feel late. Prefer a mild threshold and a fast release, or skip the compressor if caps already hold.

---

## Phase 24 — Desert wind and what you hit

**Theme:** Speed and collisions already have signals. Give them voices that match the desert and the prop.

**Goals**

- A wind bed follows speed on the ground. It is quiet when parked and thinner in the air (same idea as Phase 20 rumble: no full stall, no full road roar).
- An impact thud’s pitch or filter follows `ObstacleKind` when the hit has a kind. A nameless scrape keeps today’s tone.
- Cooldown still collapses two hits into one thud.

**Deliverables**

- [x] `windGainFor(speed, airborne)` (pure). Zero below a speed floor. Airborne uses a reduced curve. Unit-tested.
- [x] A continuous wind loop on the bus, updated every step like roll and scrub, including with gain 0.
- [x] `impactVoiceFor(kind)` (or pitch/filter pair) for `rock` | `cactus` | `barrel` | `tires`, plus a default. The game passes kind from the collision when available.
- [x] Phase 20 airborne mix still zeroes roll and drops throttle load. Wind is separate and follows its own airborne rule.

**Acceptance criteria**

- Parked wind gain is 0. Two `impactThud` calls inside the cooldown still start one tone.
- Rock and barrel voices differ in at least one locked parameter (frequency or filter).
- `perf.test.ts` still passes. Master caps from Phase 15 / 23 still hold with wind at speed.

**Dependencies:** Phase 15 bus, Phase 20 airborne mix, Phase 3/10 obstacle kinds on the track.

**Risks**

- Wind plus roll plus exhaust at highway speed clips again. Cap wind under roll’s peak and keep the master limiter or caps.
- Tagging every Matter contact with a kind is noisy. Prefer the obstacle contact that produced the `impact` spike; default when unknown.

---

## Phase 25 — Steady frame, steady meter

**Theme:** Hard yaw and a flickering slosh band fight the comic read. Ease both without lying about the sim.

**Goals**

- The chase frame eases toward its lookahead target so a snap steer does not teleport the world.
- The HUD slosh band (calm / moving / lip) uses hysteresis or a short hold so it does not flicker on a noisy surface speed.
- Reduced motion keeps shake and punch at zero. It may keep camera ease (no nausea cue) and must leave the meter readable.

**Deliverables**

- [x] A pure chase ease step (position and/or lookahead blend) with unit tests for a step input and a settle-to-target.
- [x] Slosh band hysteresis: enter “lip” and “moving” at the current thresholds; leave at slightly lower ones, or hold a band for a minimum time. Unit-tested.
- [x] Golden `?demo=` frame check still places the truck in the lower half after ease settles.
- [x] No change to fluid thresholds that drive spill or the lip accent. The accent still keys off the real lip/spill signals from Phase 15.

**Acceptance criteria**

- After a large camera target jump, eased position is strictly between old and new on the first step, and matches the target after settle.
- A surface speed that chatters across the calm/moving boundary does not flip the band every frame in the hysteresis fixture.
- Phase 7 golden frame and Phase 9 meter tests still pass once updated for hysteresis.
- Replay version stays 2. Grade force and bank stay as they are.

**Dependencies:** Phase 7 chase camera, Phase 9 slosh meter, Phase 15 lip accent signal.

**Risks**

- Heavy camera lag makes the next bend chevron feel late. Ease the chase, not the chevron’s track-space position.
- Hysteresis that is too wide hides a real lip warning. Keep the enter threshold at today’s lip; only lower the exit.

---

## Phase 26 — Mode stakes on the intro

**Theme:** The mode picker names practice, contract, and time trial. It should also say what each one costs.

**Goals**

- Changing the mode select shows one short stakes line under the pickers.
- The line is a pure function of mode so copy stays unit-tested.
- Practice, contract, and time trial each get a distinct blurb.

**Deliverables**

- [x] `modeBlurb(mode)` returning one sentence per `RunMode`. Unit-tested.
- [x] An intro element (e.g. `#intro-mode-blurb`) updates when the mode select changes and on first bind.
- [x] No change to abort floors, finish floors, or URL query encoding.

**Acceptance criteria**

- Contract blurb mentions losing the run or the cargo floor. Time trial mentions time and a cargo floor. Practice mentions free practice or no fail.
- The three blurbs are non-empty and distinct in a unit test.
- Existing `parseRunConfig` / finish-floor tests still pass.

**Dependencies:** Phase 2 run modes.

**Risks**

- A long blurb pushes the CTA off a phone viewport. Keep each line under ~90 characters.

---

## Phase 27 — Checkpoints celebrate; contracts warn

**Theme:** Crossing a checkpoint only bumps a counter. Contract failure arrives without a warning band.

**Goals**

- Passing a checkpoint fires a short popup (and optional soft chime).
- Cargo danger for contract (and time-trial floor) is a pure level from remaining ratio.
- The cargo bar’s `data-level` uses that level in those modes so warn/danger read before abort.

**Deliverables**

- [x] `cargoThreatLevel(ratio, mode)` → `"ok" | "warn" | "danger"`. Contract warn above abort, danger at/under abort. Time trial warn near its finish floor. Practice keeps today’s ok/warn/bad bands or maps to the same three names.
- [x] On checkpoint index advance, add a popup naming the checkpoint. Cooldown or one popup per index so it does not spam.
- [x] HUD cargo bar uses `cargoThreatLevel` (or practice’s existing bands) every update.
- [x] Optional: one soft bus chirp on checkpoint; no new continuous layer.

**Acceptance criteria**

- Unit tests lock contract danger at/under `CONTRACT_ABORT_RATIO` and warn in a band above it.
- Advancing a checkpoint in a fixture produces exactly one popup for that index.
- Volume conservation and replay version stay unchanged.

**Dependencies:** Phase 2 contract abort, Phase 9 checkpoints, Phase 11 popups.

**Risks**

- Warning too early (e.g. at 80%) trains the player to ignore it. Keep warn close to the real floor/abort.

---

## Phase 28 — A ghost split you can read

**Theme:** The ghost car is visible. The lead or lag should be a number.

**Goals**

- When a ghost is active, the HUD shows a signed time split versus the ghost’s elapsed.
- Ahead is negative (faster); behind is positive. No ghost → no split.
- Ghost elapsed comes from summing recorded frame `dt` values as the ghost steps.

**Deliverables**

- [x] `GhostRunner` exposes `elapsed` (sum of consumed frame dts). Reset clears it.
- [x] `ghostSplitLabel(playerElapsed, ghostElapsed, active)` → `null` or a short string like `−0.4s` / `+1.2s`. Unit-tested around zero and sign.
- [x] HUD slot (reuse ghost line or add `#hud-ghost-split`) updates while driving when a ghost is active.

**Acceptance criteria**

- Equal elapsed formats as `0.0s` or an explicit even label locked by test.
- Inactive ghost returns null and leaves the split hidden.
- Ghost match rules and replay version stay as they are.

**Dependencies:** Phase 2 ghosts / replay.

**Risks**

- Comparing wall time to ghost elapsed while the player is paused double-counts pause. Only advance player elapsed while simulating, the same as today.

---

## Phase 29 — A pause screen

**Theme:** Pause changes a chip label. The player should see a clear paused state with ways out.

**Goals**

- Pausing opens an overlay: title, Resume, Restart, Settings (or Open settings).
- Resume and `P` / Escape close it and unpause. Restart uses the existing restart action.
- Sim stays frozen while the overlay is open (existing pause path).

**Deliverables**

- [x] `#overlay-pause` markup and styles consistent with fail/result cards.
- [x] `togglePause` / blur still pause the sim; showing the overlay is part of the paused UI.
- [x] Buttons wire to resume, restart, and open-settings. Escape resumes when the pause overlay is up (and settings are closed).

**Acceptance criteria**

- While paused, `simulate` still early-returns (existing behavior).
- Opening settings from pause leaves the run paused underneath.
- Reduced motion and audio duck rules from Phase 23 still apply on pause.

**Dependencies:** Phase 2 pause, Phase 23 duck.

**Risks**

- Stacking pause + settings + intro focus traps. Only one overlay owns Escape at a time; settings closes first, then pause.

---

## Phase 30 — Retry this seed, and say the spill

**Theme:** Results bury the same-seed retry. Spills never reach assistive tech.

**Goals**

- Result and fail primary actions say they retry **this** seed. New track stays secondary.
- An `aria-live` region announces spill bursts, lip band, and contract danger without visual clutter.
- Announcement copy is built by pure helpers so it can be tested.

**Deliverables**

- [x] Result/fail button labels: primary “Retry this seed” (existing restart action). Keep “New track” as the alt.
- [x] `#hud-live` (or similar) with `aria-live="polite"` and `aria-atomic="true"`.
- [x] `liveAnnouncement({ spillLiters?, band?, threat? })` (or split helpers) returns a short string or null. Unit-tested.
- [x] Game writes the live region on spill popup windows, when HUD band becomes `lip`, and when contract threat becomes `danger` (once per rising edge).

**Acceptance criteria**

- Restart still resets the same seed/config (no accidental new track).
- A zero-spill update does not announce. A lip enter announces once until the band leaves lip.
- No change to grade letters, share card, or persistence keys.

**Dependencies:** Phase 2 results, Phase 27 threat levels, Phase 25 slosh band for lip.

**Risks**

- Announcing every slosh-meter flicker is noisy. Rising-edge only, and prefer the hysteresis band for lip.

---

## Phase 31 — Dynamic music

**Theme:** An adaptive score that reads the drive without drowning the SFX bus.

**Goals**

- Layered Web Audio music responds to speed, slosh, cargo threat, prop near-miss, airtime, and impacts.
- Music and SFX mute independently; master volume and pause duck still apply.

**Deliverables**

- [x] Pure `musicMixFor` drivers with unit tests for bed / drive / bass / lead / tension / air / hit / bpm.
- [x] `AudioBus.musicTick` chase groove (pad, sequenced bass/lead, pulse, hats) under a music group gain.
- [x] Settings → **Dynamic music** persisted with the other display settings.
- [x] Game wires drivers every step while driving; idle / pause / finish silence or duck the score.

**Acceptance criteria**

- Parked active mix keeps a bed and zero drive; cruise opens drive; airborne lifts air and softens drive.
- Danger cargo and hard impacts raise tension / hit above calm baselines.
- Music off leaves SFX playing; SFX off leaves music playing; both off zeros the master.

**Dependencies:** Phase 15/23 audio bus, Phase 27 cargo threat.

**Risks**

- Score fighting the engine for headroom — keep music group gain under ~0.22 of master.

---

## Cross-cutting backlog (pull from any phase)

Items that do not block a single phase but should be picked up when touching nearby code:

| Item | Suggested phase | Notes |
|------|-----------------|-------|
| i18n strings | 2+ | Keep copy in one module; comic tone hard to translate — English first |
| Controller / gamepad API | 9 | Map to existing `DriveInput` |
| PWA manifest + offline cache | 1 or 6 | Vite PWA plugin; cache static assets only |
| E2E smoke (Playwright) | 1 | Load page, dismiss intro, drive 2 s, no console errors |
| Visual regression | 14 | Region sample with grain frozen; a full-frame hash stays noisy |
| Accessibility audit | 1 + 5 | Focus order on overlays, ARIA live for spill warnings |
| Master volume + soft mute | 23 | Avoid zipper noise when toggling SFX |
| Wind vs roll headroom | 24 | Cap wind under roll so the master does not clip |
| Chase ease vs chevron | 25 | Ease the camera, not the next-bend marker in track space |
| Mode blurb length | 26 | Keep intro stakes under ~90 characters for phones |
| Ghost split vs pause | 28 | Player elapsed only advances while the sim runs |
| Pause + settings Escape | 29 | Settings closes first, then the pause overlay |

---

## How to use this roadmap

1. **Pick the lowest phase with open checkboxes.** Phases 0–31 are done. New work starts after Phase 31.
2. **Open a GitHub issue** with label `phase-N` and copy the relevant deliverables into the description.
3. **Define done** using that phase’s acceptance criteria plus existing tests (`npm test`).
4. When a phase completes, tick boxes here in a dedicated PR and bump `package.json` minor version if user-facing.

---

## Version sketch (informative)

| Version | Phase focus |
|---------|-------------|
| **0.1.x** | Phase 0 maintenance, hotfixes |
| **0.2.x** | Phase 1 |
| **0.3.x** | Phase 2 |
| **0.4.x** | Phase 3 |
| **0.5.x** | Phase 4 |
| **0.6.x** | Phase 5 |
| **0.7.x** | Phase 6, plus the isometric view |
| **0.8.x** | Phase 7 |
| **0.9.x** | Phase 8 |
| **0.10.x** | Phase 9 |
| **0.11.x** | Phase 10 |
| **0.12.x** | Phase 11 |
| **0.13.x** | Phase 12 |
| **0.14.x** | Phase 13 |
| **0.15.x** | Phase 14 |
| **0.16.x** | Phase 15 |
| **0.17.x** | Phase 16 |
| **0.18.x** | Phase 17 |
| **0.19.x** | Phase 18 |
| **0.20.x** | Phase 19 |
| **0.21.x** | Phase 20 |
| **0.22.x** | Phase 21 |
| **0.23.x** | Phase 22 |
| **0.24.x** | Phase 23 |
| **0.25.x** | Phase 24 |
| **0.26.x** | Phase 25 |
| **0.27.x** | Phase 26 |
| **0.28.x** | Phase 27 |
| **0.29.x** | Phase 28 |
| **0.30.x** | Phase 29 |
| **0.31.x** | Phase 30 |
| **0.32.x** | Rapier3D raycast vehicle (post–Phase 30) |
| **0.33.x** | Truck detail, dune/berm 3D, live barrel sync |
| **0.34.x** | Dynamic adaptive music layers |

Semantic versioning applies to **player-visible** changes; internal refactors can patch-bump within the active phase.
