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

Phases 0–6 are shipped (v0.7.1). On top of that checklist, the main view is **true isometric**: 30° ground axes, equal foreshortening on x/y/z, solid props, and the liquid drawn inside the bed. The camera does not roll.

What that still does not do, and what the next phases are for:

- The chase camera still aims at a point ahead of the truck in world x/y, so the truck stays near the middle of the screen instead of low in the frame with the road up-screen.
- Culling is already in projected space, but callers pass height `0`, so a tall cactus whose base is just off-screen pops even when its top should be visible.
- Every archetype is a flat ribbon. The tub never feels a hill, and the third axis is only used by droplets and prop height.
- The iso frame hides the next bend, and the HUD shows cargo left but not how hard the surface is moving.
- Keyboard and touch are the only inputs.
- Wheels do not spin, the body does not squat, and a collision has no sound of its own.

A separate change thickens the pickup model and replaces the single engine tone with a layered mix. Phases 7–11 do not wait on it.

---

## Phase 7 — Frame the isometric drive

**Theme:** Keep the fixed iso axes, and point the frame at the drive.

**Goals**

- The road ahead stays up-screen and the truck stays in the lower half, including through a fast bend.
- A prop whose top is on screen is drawn even when its base is just outside the frame.
- The settings text matches the camera that actually ships.

**Deliverables**

- [ ] Screen-space lookahead: convert the chase point through the iso projection before applying zoom, so speed looks ahead *up the screen* rather than only along world +x/+y.
- [ ] Pass real heights into the existing projected `inView` test for obstacles, cacti, and flags. Today those callers pass `0`.
- [ ] Reduced-motion copy and behavior: shake and spill punch only. No roll control, no roll promise.
- [ ] One golden-frame check for `?demo=` (pixel sample or hash with a stated tolerance) so a model or camera change fails CI on purpose.

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

- [ ] A height profile on the centerline, pure function of the seed and archetype. Flats stay within a centimeter of z = 0.
- [ ] An explicit grade force on the chassis. Leave Matter’s gravity at zero so the tire model stays the integrator.
- [ ] Add the grade’s gravity to the fluid pseudo-acceleration (`FluidLayer` already adds −a). A resting tub on a slope shifts its centroid downhill.
- [ ] Draw the road as a ribbon that follows the height. Props, puddles, and shadows sit on the local ground height.
- [ ] Replay and conservation tests stay valid: height is part of the seed, mass is still conserved.

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

- [ ] A next-bend chevron (or a short screen-space ribbon) aimed at `Track.pointAt` a fixed distance ahead. It uses the iso projection, so it sits on the road.
- [ ] A HUD slosh meter fed by `FluidLayer.sloshSpeed`, with thresholds for calm / moving / at the lip.
- [ ] Gamepad: left stick steers, right trigger or right stick is the pedal, one button is the handbrake. Fold it into `Input.poll` so Practice, Contract, and Time trial do not grow a second control path.

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

- [ ] Banked bends: a lateral grade into the same fluid term as Phase 8, signed by the turn.
- [ ] Short ramps: a vertical velocity on the chassis, landing with the existing impact value. Droplets already fly in z.
- [ ] Dry washes: a seeded dip with the sand grip, so the slow line and the fast line are different choices.
- [ ] A cap on new dynamic bodies so `perf.test.ts` still passes.

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

- [ ] A mark on each wheel (hub or sidewall) advances with distance traveled, including while steering.
- [ ] Body pitch and squat read the longitudinal load transfer already computed for the tires. At rest the offset is zero.
- [ ] An impact thud scaled by `VehicleSnapshot.impact`, with the same kind of cooldown the spill splash uses, so a scrape does not machine-gun.
- [ ] A `?demo=` review capture that actually contains a spill droplet and a dust puff. The last visual passes never caught either on screen.

**Acceptance criteria**

- Wheel angle is a function of distance and is unit-tested, including a zero-speed hold.
- Pitch is zero with zero longitudinal transfer, and it leans the right way under braking in a fixture.
- Impact below the threshold starts no one-shot; above it, two calls inside the cooldown start one.

**Dependencies:** Phase 10 if the thud should read ramp landings; otherwise only the current `impact` field. Can start from Phase 7 in parallel with 8–10, but the landing check waits on Phase 10.

**Risks**

- Pitching the whole chassis visually while the tub mesh stays in truck-local space will shear the liquid. Pitch the body and cab, and keep the tub opening fixed to the bed so the clip still matches.

---

## Cross-cutting backlog (pull from any phase)

Items that do not block a single phase but should be picked up when touching nearby code:

| Item | Suggested phase | Notes |
|------|-----------------|-------|
| i18n strings | 2+ | Keep copy in one module; comic tone hard to translate — English first |
| Controller / gamepad API | 9 | Map to existing `DriveInput` |
| PWA manifest + offline cache | 1 or 6 | Vite PWA plugin; cache static assets only |
| E2E smoke (Playwright) | 1 | Load page, dismiss intro, drive 2 s, no console errors |
| Visual regression | 7 | Golden `?demo=` frame; grain makes a full-frame hash noisy |
| Accessibility audit | 1 + 5 | Focus order on overlays, ARIA live for spill warnings |

---

## How to use this roadmap

1. **Pick the lowest phase with open checkboxes.** Phases 0–6 are done. New work starts at Phase 7 unless the issue says why it skips ahead.
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

Semantic versioning applies to **player-visible** changes; internal refactors can patch-bump within the active phase.
