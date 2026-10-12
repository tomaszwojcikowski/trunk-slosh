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

On the intro screen you can pick **Practice**, **Contract**, or **Time trial**, set **cargo** and **vehicle** presets, **difficulty**, **route** (flats, canyon, boulder field, or from the seed), and **Today’s seed** (UTC daily). The seed is on the intro card, the HUD, and the results card. Results also show spill volume, off-road time, peak slosh, and hardest G. Bests live in `localStorage`: practice and contract keep the fuller tank, time trial keeps the faster finish. A new best also stores a ghost. The next run on that same seed draws it as a translucent car.

Sound starts on the first key or tap (browser autoplay rules). The engine is a continuous tone; tire scrub, slosh, spills, and impact thuds are short one-shots. Turn it off under Settings → Sound effects. Reduced motion clears camera shake and the spill punch and does not tilt the isometric axes. The HUD slosh meter reads calm, moving, or at the lip from the surface speed. `?review=juice` is a scripted brake-and-yaw for a spill and dust frame. **Clear saved data** in Settings removes bests, ghosts, achievements, custom goo, and tutorial history. Sound and display settings stay. Hints can show again after a clear.

**Share card** on the results screen saves a PNG (or the system share sheet) with the grade, seed, and a QR code that opens the same run. **Copy score post** copies a short result and opens [GitHub Discussions](https://github.com/tomaszwojcikowski/trunk-slosh/discussions) so a daily score can be posted by hand. Nothing is uploaded by the game. Enable Discussions on the repo if that page is still off.

**Achievements** (local only): first S rank, a zero-spill finish, a hard or boulder route, a fulfilled contract, and a daily delivery. They show in Settings.

**Custom goo:** Settings → Export goo JSON, edit `active` (`viscosityMul`, `pseudoMul`, `density`, `fillDepth`, `wallHeight`), then Import. The file also includes the tub box and the built-in cargos. `?goo=1` turns the saved goo on. Ghosts stay off while custom goo is active so a tuned liquid is not raced against a water replay.

**URL flags** (share read-only links): `?seed=12345`, `?daily=1`, `?mode=contract|practice|timetrial`, `?difficulty=easy|medium|hard`, `?archetype=flats|canyon|boulder`, `?cargo=water|thick|volatile`, `?vehicle=pickup|short`, `?goo=1`, `?worker=1` (fluid step one frame behind on a worker; sync sim stays default so replays match). Thick cargo is olive and volatile cargo is brighter green; water stays the default toxic green.

Each run is graded on how much cargo you deliver, from S down to D.

## How it looks: ink pipeline

1. **Isometric art pass** (`src/render/Renderer.ts`) draws the scene into an offscreen canvas in true isometric (30° ground axes, x/y/z foreshortened equally, fixed camera). The chase frame keeps the truck in the lower half and the road up-screen. The ground, road, puddles and skids sit on the local road height. The truck, the open tub with its live liquid surface, rocks, cacti, barrels, tire stacks and finish flags are solids with height, back-face culled and painter-sorted. A chevron marks the centerline ahead. The sun sits to the viewer's upper left, so left faces are lit, right faces are in shade, and hard-edged shadows fall toward the lower right. Wheels carry a mark that rolls with distance, and the cab pitches under braking.
2. **WebGL post-process** (`src/render/InkPost.ts`) runs one full-screen fragment shader:
   - Sobel edge detection on color for extra ink on strong silhouettes
   - Posterized brightness bands (cel shading) that keep hue
   - Three levels of **world-anchored crosshatching** in dark areas (drop shadows, tires), so hatching stays fixed to the ground instead of swimming across the screen
   - Paper grain and a warm vignette
3. If WebGL is unavailable, the isometric scene is shown directly through a 2D canvas fallback.

Render resolution adapts to the device (capped at about 1.6 megapixels on touch devices) to stay smooth on phones.

## How it moves: physics

Everything uses SI units (meters, kilograms, seconds) at a 120 Hz fixed step.

- **Car**: a [Matter.js](https://brm.io/matter-js/) rigid body integrates motion and resolves collisions with roadside rocks, cacti, barrels and tire stacks. Forces come from a bicycle model with a simplified Pacejka "magic formula" tire, longitudinal load transfer, a friction circle on the driven rear axle, power-limited drive, brake lock-up and aerodynamic drag. Grip and rolling resistance change on sand and in dry washes. Matter's gravity stays at zero; an explicit grade force pulls the chassis downhill. Short ramps add a vertical channel so the truck can leave the ground and land.
- **Road**: flats stay level. Canyon routes climb and drop. Boulder routes step. Bends bank so the liquid shifts to the outside. Height is part of the seed. Replay blobs are version 2; older recordings are not matched as ghosts.
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
