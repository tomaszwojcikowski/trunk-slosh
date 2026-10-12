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
| **Vehicle** | Matter.js body + bicycle model, Pacejka-lite tires, load transfer, sand grip, collisions |
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

Phases 0–11 are shipped on this line (v0.12.0). The main view is true isometric. The chase frame holds the truck in the lower half. The road is a height-following ribbon: flats stay level, canyon routes climb, boulder routes step, bends bank, and a short ramp can leave the ground. The HUD has a slosh meter and a next-bend chevron. A gamepad drives the same pedals as the keys. Wheels carry a mark that advances with distance, the cab pitches under braking, and a hard hit plays an impact thud.

The picture and the mix are still the thin ones from before that motion work:

- The pickup is a chamfered prism. Wheels are boxes with a cream dot. Hood stripes, the scoop, and the lamps are flat graphics on the body’s top plane, so pitch shears them. There is no raised hood, grille, glass plane, or bed rail.
- Rocks are one frustum. Cacti are a cylinder plus arm prisms. Barrels are a banded cylinder. Tire stacks are cylinders with a painted hub circle.
- Banking moves the liquid and does not move the road. The ribbon is level across its width. Boulder steps and the ramp read only as a slow rise. Shadows are a flat offset on the local ground plane.
- Droplets and dust puffs are circles. `?review=juice` holds both on screen.
- The ink pass is still one fragment shader: Sobel, five cel bands, world-anchored hatch, animated grain, vignette. Grain makes a full-frame hash noisy. The Phase 7 check is geometric (the truck stays in the lower half).
- The engine is one saw and one triangle on the same frequency, through a lowpass. Tire scrub, slosh, splash, and the impact thud are one-shots. There is no road rumble, no exhaust layer, and no continuous slosh bed. Scrub is updated only while some wheel’s skid is above 0.2, so the rasp can stick after the slide ends. Thick, water, and volatile cargo share that mix; only the tub color changes.

`main` has a separate models pass (round tires, raised hood, bumper, grille, lamps, bed rails, glass, a two-stage rock, cactus spines, a barrel lid, and a layered mix with road rumble and a continuous slosh bed). That pass is not in this tree. It draws the truck at height 0, the tires do not roll with `wheelAngle`, the body does not pitch, and that mix has no impact thud. Phases 12–16 bring that art and mix onto the height, spin, pitch, and thud this tree already has, then add the reads neither line has: a visible bank, ink that can be sampled, and a cargo voice.

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

- [ ] Bring the models-pass solids onto this tree’s `car.z`, pitch lift, and painter order. The tub opening stays on the bed, with no pitch term, so the clip still matches.
- [ ] A sidewall or hub mark advances with `wheelAngle`, including while steering.
- [ ] Draw the two-stage rock, cactus spines, barrel lid, and tire hub at `obstacle.z` (and flag poles at their ground height). Collision radii stay as they are.

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

- [ ] Cross-slope the road quad by `bankAt`. Flats and any segment with bank 0 stay level across the width.
- [ ] A darker band or a crease along a boulder rise and along the ramp crown, using the height profile that is already there.
- [ ] Cast contact shadows on the local ground height. A shadow does not drop onto a neighboring segment’s z.

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

- [ ] One grain uniform. At 0 the paper grain is a constant. The default stays the current animated grain.
- [ ] `?review=juice` and a paused `?demo=` hold can request grain 0 without a second shader.
- [ ] Keep the lit liquid color distinct enough that the five cel bands do not fold it into the mid green. The liquid hatch mask still keeps deep-tub hue.

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

- [ ] Bring the layered bus across: `engineFreqFor`, `engineGainFor`, `rollGainFor`, `sloshGainFor`. The body layer uses a fixed fraction of the engine gain when the engine is audible, and 0 when it is parked.
- [ ] Call `tireScrub`, `surfaceRoll`, and the slosh bed every step. Scrub gain is 0 when the amount is below 0.2.
- [ ] Continuous slosh from `sloshSpeed`, silent under the calm threshold (0.08). Add a short lip accent only when the HUD band is “lip” or a spill starts. Calm frames start no one-shot.
- [ ] Keep `impactThud` and `impactGainFor`. The cooldown still collapses two hits into one.

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

- [ ] A pure function from cargo preset to slosh-filter cutoff (and, if useful, splash brightness). Water is the current bed. Thick is lower. Volatile is higher. Viscosity and `colorShift` stay on the preset data that already exists.
- [ ] Draw each droplet as a teardrop or a short streak along its flight. Keep the volume-based size.
- [ ] Draw each puff as two overlapping lobes. The `?review=juice` pause still catches both a droplet and a puff.

**Acceptance criteria**

- The three cargo cutoffs are unit-tested and ordered thick &lt; water &lt; volatile.
- Volume conservation tests still pass for thick cargo. The hue shift tests still pass.
- A `?review=juice` frame shows a non-circular droplet and a two-lobe puff. The scripted brake still produces both.

**Dependencies:** Phase 15 mix, Phase 11 review capture, Phase 3 cargo presets.

**Risks**

- A streak longer than the droplet’s travel in one frame reads as a ribbon. Cap the streak at a fraction of the speed step.
- Changing splash brightness per cargo can hide a small spill. Keep the 0.3 L splash gate from the current bus.

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

---

## How to use this roadmap

1. **Pick the lowest phase with open checkboxes.** Phases 0–11 are done. New work starts at Phase 12 unless the issue says why it skips ahead.
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

Semantic versioning applies to **player-visible** changes; internal refactors can patch-bump within the active phase.
