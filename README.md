# Trunk Slosh

An isometric driving game with a comic-book, Borderlands-style look. You haul an open tub of toxic goo across a procedurally generated desert. Corner too hard, brake too late or clip a rock, and the liquid sloshes over the lip onto the road.

**Live demo (GitHub Pages):** https://tomaszwojcikowski.github.io/trunk-slosh/ (after CI deploy; see [.github/DEPLOY.md](.github/DEPLOY.md))

**Roadmap:** planned development phases, deliverables, and acceptance criteria are in [ROADMAP.md](ROADMAP.md).

## Run locally

```bash
npm install
npm run dev
```

Dev server: http://127.0.0.1:49217. Append `?demo` for an autopilot attract mode, or `?demo=30` to fast-forward 30 seconds into a run.

## Controls

| Input | Action |
|-------|--------|
| `W` / `S` (or arrows) | Gas / brake, then reverse. Keyboard pedals ramp in like a real foot. |
| `A` / `D` | Steer |
| `Space` | Handbrake |
| `R` / `N` | Restart / new track |
| `P` | Pause (window blur also pauses) |
| `,` | Settings (ink, SFX, motion, quality, touch/keyboard ramp, export replay, custom goo) |
| `H` | Toggle the ink shader (compare with the flat render) |
| `I` | Toggle the isometric **tub 3D** panel (flow arrows + slosh mesh); click the panel to enlarge, `Esc` to close |
| `` ` `` | Debug vectors (velocity, acceleration, liquid center of mass) |
| Touch | Left pad steers, right pad is gas/brake, **Drift** is the handbrake |
| Gamepad | Left stick steers, right trigger or right stick is the pedal, south or east button is the handbrake |

On the intro screen you can pick **Practice**, **Contract**, or **Time trial**, set **cargo** and **vehicle** presets, **difficulty**, **route** (flats, canyon, boulder field, or from the seed), and **Today’s seed** (UTC daily). Each mode shows a one-line stakes blurb under the pickers. The seed is on the intro card, the HUD, and the results card. The speed panel names the local grade (level, or a signed percent) and whether the truck is on the ground or in the air. Checkpoints pop when you pass them. Contract and time-trial cargo bars warn before a fail. Pause opens a card with Resume, Retry this seed, and Settings. Results and fail screens lead with **Retry this seed**. Results also show spill volume, off-road time, peak slosh, airborne time, and hardest G. Bests live in `localStorage`: practice and contract keep the fuller tank, time trial keeps the faster finish. Easy and hard keep their own records; a medium best stays on the original mode-and-seed key. A new best also stores a ghost for that difficulty. The next run on that same seed and difficulty draws it as a translucent car with the same axles, and the HUD shows a signed time split versus that ghost.

Sound starts on the first key or tap (browser autoplay rules). The engine is a layered tone — fundamental, a detuned twin, a sub and exhaust noise — that follows speed and throttle, and drops the throttle term while the truck is in the air. Road rumble follows speed, drops and thickens on sand, and goes quiet in the air. Desert wind follows speed and thins in the air. Tire scrub rasps in a slide. The tub slosh is a continuous bed that fades when the surface settles: thick cargo darkens it, volatile cargo brightens it, and a short accent plays at the lip or when a spill starts. Spills are a thump plus a splash, and a hard hit or a landing plays an impact thud whose voice follows the prop when known. Master volume is under Settings; mute and pause duck the continuous layers without a click. Turn SFX off under Settings → Sound effects. Reduced motion clears camera shake and the spill punch, and skips pitch overshoot. It leaves the mix playing and leaves the grade and air reads visible, and it does not tilt the isometric axes. The cab spring-settles under braking. Dust, skids, and spill popups fade with life. The HUD slosh meter reads calm, moving, or at the lip with hysteresis so the band does not chatter. The first steep grade and the first jump each show one hint. `?review=juice` is a scripted brake-and-yaw for a spill and dust frame, and it freezes the paper grain so a capture stays still. **Clear saved data** in Settings removes bests, ghosts, achievements, custom goo, and tutorial history. Sound and display settings stay. Hints can show again after a clear.

**Share card** on the results screen saves a PNG (or the system share sheet) with the grade, seed, and a QR code that opens the same run. **Copy score post** copies a short result and opens [GitHub Discussions](https://github.com/tomaszwojcikowski/trunk-slosh/discussions) so a daily score can be posted by hand. Nothing is uploaded by the game. Enable Discussions on the repo if that page is still off.

**Achievements** (local only): first S rank, a zero-spill finish, a hard or boulder route, a fulfilled contract, and a daily delivery. They show in Settings.

**Custom goo:** Settings → Export goo JSON, edit `active` (`viscosityMul`, `pseudoMul`, `density`, `fillDepth`, `wallHeight`), then Import. The file also includes the tub box and the built-in cargos. `?goo=1` turns the saved goo on. Ghosts stay off while custom goo is active so a tuned liquid is not raced against a water replay.

**URL flags** (share read-only links): `?seed=12345`, `?daily=1`, `?mode=contract|practice|timetrial`, `?difficulty=easy|medium|hard`, `?archetype=flats|canyon|boulder`, `?cargo=water|thick|volatile`, `?vehicle=pickup|short`, `?goo=1`, `?worker=1` (fluid step one frame behind on a worker; sync sim stays default so replays match). Thick cargo is olive and volatile cargo is brighter green; water stays the default toxic green.

Each run is graded on how much cargo you deliver, from S down to D.

## How it looks: ink pipeline

1. **Isometric art pass** (`src/render/Renderer.ts`) draws the scene into an offscreen canvas in true isometric (30° ground axes, x/y/z foreshortened equally, fixed camera). The chase frame keeps the truck in the lower half and the road up-screen. The ground, road, puddles and skids sit on the local road height. A banked bend lifts the inside edge of the ribbon. Boulder rises and the ramp crown carry a darker crease. The truck, the open tub with its live liquid surface, rocks, cacti, barrels, tire stacks and finish flags are solids with height, back-face culled and painter-sorted. A short-wheelbase truck draws shorter axles, nose, and tail; the cab and the tub opening stay put. Droplets leave a short streak, and dust puffs have a second lobe. A chevron marks the centerline ahead. The sun sits to the viewer's upper left, so left faces are lit, right faces are in shade, and hard-edged contact shadows fall toward the lower right on the ribbon under the prop. Wheels carry a mark that rolls with distance, and the cab pitches under braking. The liquid keeps a lit band that survives the cel pass.
2. **WebGL post-process** (`src/render/InkPost.ts`) runs one full-screen fragment shader:
   - Sobel edge detection on color for extra ink on strong silhouettes
   - Posterized brightness bands (cel shading) that keep hue
   - Three levels of **world-anchored crosshatching** in dark areas (drop shadows, tires), so hatching stays fixed to the ground instead of swimming across the screen
   - Paper grain and a warm vignette. Grain is one uniform; a review capture and a paused demo set it to a constant
3. If WebGL is unavailable, the isometric scene is shown directly through a 2D canvas fallback.

Render resolution adapts to the device (capped at about 1.6 megapixels on touch devices) to stay smooth on phones.

## How it moves: physics

Everything uses SI units (meters, kilograms, seconds) at a 120 Hz fixed step.

- **Car**: a [Rapier3D](https://rapier.rs/) raycast vehicle (`DynamicRayCastVehicleController`) integrates the chassis with four spring–damper wheels, engine/brake forces, and suspension travel. Roadside rocks, cacti, barrels and tire stacks are Rapier colliders (barrels can roll). The game plane maps to Rapier XZ with Y up; gravity and the ribbon ground pull the truck along grades. Sand and washes lower per-wheel friction slip; aero drag and liquid CoM reaction still apply as chassis forces. The tub keeps the custom MAC fluid solver and reads a `FluidFrame` from chassis accel / yaw.
- **Road**: flats stay level at every difficulty. Canyon routes climb and drop. Boulder routes step. Easy hills are gentler; medium and hard stay on the same height cap. Bends bank so the liquid shifts to the outside, and the ribbon shows that same bank. Height is part of the seed. Replay blobs are version 2; older recordings are not matched as ghosts.
- **Liquid** (`src/physics/FluidLayer.ts`): shallow-water equations on a staggered (MAC) grid inside the tub. Mass is conserved exactly using upwind fluxes with an outflow limiter. The tub is a non-inertial frame, so the solver adds the car's linear, Euler (yaw acceleration), centrifugal and Coriolis pseudo-forces. Liquid leaves over the lip according to the sharp-crested weir equation.
- **Coupling**: the liquid's mass is added to the car's mass and rotational inertia, and the reaction force from its sloshing center of mass is fed back into the chassis.
- **Spills** fly ballistically from the lip, land as puddles sized by volume, and slowly soak into the sand. Tire slide leaves skid marks and kicks up dust.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest unit tests (fluid conservation and spill, vehicle dynamics, track, particles, skill vs. spill) |
| `npm run typecheck` | TypeScript only (`tsc --noEmit`) |
| `npm run lint` | Biome check |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |

For local preview of GitHub Pages paths:

```bash
VITE_BASE_PATH=/trunk-slosh/ npm run build && npm run preview
```

## CI & deploy

GitHub Actions runs `npm test` and `npm run build` on push and on pull requests. Merges to `main` deploy `dist/` to **GitHub Pages** (repository name `trunk-slosh`, base path `/trunk-slosh/`).

Enable Pages once: **Settings → Pages → Build and deployment → GitHub Actions**.
