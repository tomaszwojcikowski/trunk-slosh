# Trunk Slosh

A top-down driving game with a comic-book, Borderlands-style look. You haul an open tub of toxic goo across a procedurally generated desert. Corner too hard, brake too late or clip a rock, and the liquid sloshes over the lip onto the road.

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
| `,` | Settings (ink, SFX, motion, quality, touch/keyboard ramp, export replay) |
| `H` | Toggle the ink shader (compare with the flat render) |
| `I` | Toggle the isometric **tub 3D** panel (flow arrows + slosh mesh); click the panel to enlarge, `Esc` to close |
| `` ` `` | Debug vectors (velocity, acceleration, liquid center of mass) |
| Touch | Left pad steers, right pad is gas/brake, **Drift** is the handbrake |

On the intro screen you can pick **Practice**, **Contract**, or **Time trial**, set **cargo** and **vehicle** presets, **difficulty**, and **Today’s seed** (UTC daily). Results show spill volume, off-road time, peak slosh, and hardest G; bests are stored in `localStorage`.

**URL flags** (share read-only links): `?seed=12345`, `?daily=1`, `?mode=contract|practice|timetrial`, `?difficulty=easy|medium|hard`, `?cargo=water|thick|volatile`, `?vehicle=pickup|short`, `?worker=1` (experimental fluid worker; sync sim stays default for replay determinism).

Each run is graded on how much cargo you deliver, from S down to D.

## How it looks: ink pipeline

1. **2D art pass** (`src/render/Renderer.ts`) draws flat, saturated shapes into an offscreen canvas. Props get thick ink strokes and a cel highlight: the shape is filled in its shade color, clipped, then refilled in its base color shifted toward the sun. Drop shadows are hard-edged.
2. **WebGL post-process** (`src/render/InkPost.ts`) runs one full-screen fragment shader:
   - Sobel edge detection on color for extra ink on strong silhouettes
   - Posterized brightness bands (cel shading) that keep hue
   - Three levels of **world-anchored crosshatching** in dark areas (drop shadows, tires), so hatching stays fixed to the ground instead of swimming across the screen
   - Paper grain and a warm vignette
3. If WebGL is unavailable, the scene is shown flat through a 2D fallback.

Render resolution adapts to the device (capped at about 1.6 megapixels on touch devices) to stay smooth on phones.

## How it moves: physics

Everything uses SI units (meters, kilograms, seconds) at a 120 Hz fixed step.

- **Car**: a [Matter.js](https://brm.io/matter-js/) rigid body integrates motion and resolves collisions with roadside rocks, cacti, barrels and tire stacks. Forces come from a bicycle model with a simplified Pacejka "magic formula" tire, longitudinal load transfer, a friction circle on the driven rear axle, power-limited drive, brake lock-up and aerodynamic drag. Grip and rolling resistance change on sand.
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
