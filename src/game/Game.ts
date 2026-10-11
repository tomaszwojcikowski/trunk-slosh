import { Input } from '../input/Input'
import type { Vec2 } from '../math/vec2'
import { FluidLayer } from '../physics/FluidLayer'
import { ParticlePool, type SpillEvent } from '../physics/Particles'
import { TRUNK_LIP_HEIGHT } from '../physics/trunkConstants'
import { VehicleSimulation, type DriveInput, type VehicleSnapshot } from '../physics/VehicleSimulation'
import { createPresenter, type Presenter } from '../render/InkPost'
import { Renderer, type Camera } from '../render/Renderer'
import { Track } from '../world/Track'

const FIXED_DT = 1 / 120
const MAX_STEPS = 10
const HATCH_PERIOD = 7

type Phase = 'ready' | 'driving' | 'finished'

type Hud = {
  liquid: HTMLElement
  liquidBar: HTMLElement
  speed: HTMLElement
  time: HTMLElement
  progress: HTMLElement
  g: HTMLElement
  intro: HTMLElement
  result: HTMLElement
  resultKept: HTMLElement
  resultTime: HTMLElement
  resultGrade: HTMLElement
  resultQuip: HTMLElement
  ink: HTMLElement
}

function grade(kept: number): { letter: string; quip: string } {
  if (kept >= 0.97) return { letter: 'S', quip: 'Not a single drop. Legendary loot.' }
  if (kept >= 0.9) return { letter: 'A', quip: 'Smooth operator. The client barely noticed.' }
  if (kept >= 0.75) return { letter: 'B', quip: 'Some sloshing. Nothing a mop can’t fix.' }
  if (kept >= 0.5) return { letter: 'C', quip: 'Half the cargo is now desert decoration.' }
  return { letter: 'D', quip: 'The trunk is mostly vibes at this point.' }
}

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

export class Game {
  private track: Track
  private readonly vehicle = new VehicleSimulation()
  private readonly fluid = new FluidLayer()
  private readonly particles = new ParticlePool()
  private readonly renderer = new Renderer()
  private readonly presenter: Presenter
  private readonly input: Input
  private readonly hud: Hud
  private readonly wrap: HTMLElement

  private phase: Phase = 'ready'
  private elapsed = 0
  private clock = 0
  private last = performance.now()
  private accum = 0
  private camera: Camera = { x: 0, y: 0, zoom: 16 }
  private shake = 0
  private inkEnabled = true
  private debug = false
  private lastWheel: (Vec2 | null)[] = [null, null, null, null]
  private spillWindow = 0
  private spillTimer = 0
  private hudCache = new Map<HTMLElement, string>()
  private readonly demo = new URLSearchParams(window.location.search).has('demo')

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.wrap = root
    this.presenter = createPresenter(canvas)
    this.input = new Input(root)
    this.hud = {
      liquid: root.querySelector('#hud-liquid')!,
      liquidBar: root.querySelector('#hud-liquid-bar')!,
      speed: root.querySelector('#hud-speed')!,
      time: root.querySelector('#hud-time')!,
      progress: root.querySelector('#hud-progress')!,
      g: root.querySelector('#hud-g')!,
      intro: root.querySelector('#overlay-intro')!,
      result: root.querySelector('#overlay-result')!,
      resultKept: root.querySelector('#result-kept')!,
      resultTime: root.querySelector('#result-time')!,
      resultGrade: root.querySelector('#result-grade')!,
      resultQuip: root.querySelector('#result-quip')!,
      ink: root.querySelector('#btn-ink')!,
    }
    if (this.presenter.kind === '2d') this.hud.ink.hidden = true

    this.track = new Track(this.randomSeed())
    this.resetRun()

    this.input.onAction((a) => {
      if (a === 'restart') this.resetRun()
      else if (a === 'newTrack') this.newTrack()
      else if (a === 'toggleInk') this.toggleInk()
      else if (a === 'toggleDebug') this.debug = !this.debug
    })
    root.querySelectorAll<HTMLButtonElement>('[data-action="restart"]').forEach((b) =>
      b.addEventListener('click', () => this.resetRun()),
    )
    root.querySelectorAll<HTMLButtonElement>('[data-action="new-track"]').forEach((b) =>
      b.addEventListener('click', () => this.newTrack()),
    )
    this.hud.ink.addEventListener('click', () => this.toggleInk())

    window.addEventListener('resize', () => this.onResize())
    this.onResize()
    const warmup = Number(new URLSearchParams(window.location.search).get('demo'))
    if (this.demo && warmup > 0) {
      for (let t = 0; t < Math.min(warmup, 120); t += FIXED_DT) this.simulate(FIXED_DT)
      const snap = this.vehicle.snapshot()
      this.camera = { x: snap.pos.x, y: snap.pos.y, zoom: this.targetZoom(snap.speed) }
    }
    requestAnimationFrame((t) => this.frame(t))
  }

  private randomSeed() {
    return Math.floor(Math.random() * 1e9)
  }

  private newTrack() {
    this.track = new Track(this.randomSeed())
    this.resetRun()
  }

  private toggleInk() {
    this.inkEnabled = !this.inkEnabled
    this.hud.ink.textContent = this.inkEnabled ? 'Ink: on' : 'Ink: off'
  }

  private resetRun() {
    this.vehicle.reset(this.track)
    this.fluid.reset()
    this.particles.clear()
    this.phase = 'ready'
    this.elapsed = 0
    this.accum = 0
    this.shake = 0
    this.spillWindow = 0
    this.lastWheel = [null, null, null, null]
    this.camera = { x: this.track.start.x, y: this.track.start.y, zoom: this.targetZoom(0) }
    this.hud.intro.hidden = false
    this.hud.result.hidden = true
  }

  private onResize() {
    const w = Math.max(1, this.wrap.clientWidth)
    const h = Math.max(1, this.wrap.clientHeight)
    const coarse = window.matchMedia('(pointer: coarse)').matches
    let pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.75)
    const budget = coarse ? 1.6e6 : 2.6e6
    if (w * h * pr * pr > budget) pr = Math.sqrt(budget / (w * h))
    this.renderer.resize(w, h, pr)
    this.presenter.resize(this.renderer.canvas.width, this.renderer.canvas.height)
  }

  private targetZoom(speed: number) {
    const minDim = Math.min(this.wrap.clientWidth, this.wrap.clientHeight) || 600
    return minDim / (15 + speed * 0.45)
  }

  /** Lookahead pursuit along the centerline; powers the `?demo` attract mode. */
  private autopilot(): DriveInput {
    const snap = this.vehicle.snapshot()
    const along = this.track.query(snap.pos).along
    const target = this.track.pointAt(along + 10 + snap.speed * 0.6).p
    let err = Math.atan2(target.y - snap.pos.y, target.x - snap.pos.x) - snap.angle
    err = Math.atan2(Math.sin(err), Math.cos(err))
    return {
      throttle: snap.speed < 15 - Math.abs(err) * 22 ? 0.5 : -0.2,
      steer: Math.max(-1, Math.min(1, err * 2.2)),
    }
  }

  private simulate(dt: number) {
    const drive =
      this.phase === 'finished'
        ? { throttle: this.vehicle.snapshot().speed > 0.5 ? -0.5 : 0, steer: 0 }
        : this.demo
          ? this.autopilot()
          : this.input.poll(dt)
    if (this.phase === 'ready' && (this.input.engaged || this.demo)) {
      this.phase = 'driving'
      this.hud.intro.hidden = true
    }

    this.vehicle.step(dt, drive, this.track, this.fluid)
    const spills = this.fluid.step(dt, this.vehicle.fluidFrame())
    if (spills.length) this.emitSpills(spills.map((s) => this.toWorldSpill(s.local, s.relVel, s.volume)))
    this.particles.step(dt)
    if (this.phase === 'driving') this.elapsed += dt

    this.trackWheels(dt)
    this.trackSpillPopups(dt)
    this.checkFinish()
  }

  private toWorldSpill(local: Vec2, relVel: Vec2, volume: number): SpillEvent {
    const pos = this.vehicle.localToWorld(local)
    const base = this.vehicle.pointVelocity(local)
    const angle = this.vehicle.angle
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return {
      x: pos.x,
      y: pos.y,
      z: TRUNK_LIP_HEIGHT,
      vx: base.x + relVel.x * c - relVel.y * s,
      vy: base.y + relVel.x * s + relVel.y * c,
      vz: 0.4,
      volume,
    }
  }

  private emitSpills(events: SpillEvent[]) {
    this.particles.emit(events)
    for (const e of events) this.spillWindow += e.volume
  }

  private trackSpillPopups(dt: number) {
    this.spillTimer -= dt
    if (this.spillTimer > 0 || this.spillWindow < 0.0005) return
    const liters = this.spillWindow * 1000
    const pos = this.vehicle.localToWorld({ x: -1.35, y: 0 })
    const big = liters > 6
    this.particles.addPopup(pos.x, pos.y - 1.5, big ? `SPLOOSH! -${liters.toFixed(0)}L` : `-${liters.toFixed(1)}L`, big)
    this.spillWindow = 0
    this.spillTimer = 0.45
  }

  private trackWheels(dt: number) {
    const snap = this.vehicle.snapshot()
    snap.wheels.forEach((w, i) => {
      const prev = this.lastWheel[i]
      if (w.skid > 0.12 && snap.speed > 1) {
        if (prev) this.particles.addSkid(prev, w.world, w.skid * (w.sand ? 0.6 : 1))
        this.lastWheel[i] = { ...w.world }
      } else {
        this.lastWheel[i] = null
      }
      const dusty = (w.sand && snap.speed > 3) || w.skid > 0.35
      if (i >= 2 && dusty && Math.random() < dt * (w.sand ? 26 : 14) * Math.min(1, snap.speed / 10 + w.skid)) {
        this.particles.addPuff(
          w.world.x,
          w.world.y,
          -snap.vel.x * 0.15 + (Math.random() - 0.5) * 1.5,
          -snap.vel.y * 0.15 + (Math.random() - 0.5) * 1.5,
          0.35 + Math.random() * 0.35,
        )
      }
    })
    if (snap.impact > 25) this.shake = Math.min(1, this.shake + snap.impact / 120)
  }

  private updateCamera(frameDt: number, snap: VehicleSnapshot) {
    const look = Math.min(1, snap.speed / 25) * 0.55
    const tx = snap.pos.x + snap.vel.x * look
    const ty = snap.pos.y + snap.vel.y * look
    const k = 1 - Math.pow(0.02, frameDt)
    this.camera.x += (tx - this.camera.x) * k
    this.camera.y += (ty - this.camera.y) * k
    this.camera.zoom += (this.targetZoom(snap.speed) - this.camera.zoom) * (1 - Math.pow(0.2, frameDt))
    this.shake *= Math.pow(0.02, frameDt)
  }

  private checkFinish() {
    if (this.phase !== 'driving') return
    const pos = this.vehicle.localToWorld({ x: 0, y: 0 })
    const q = this.track.query(pos)
    if (q.along >= this.track.finishS && q.dist < this.track.roadWidth) {
      const snap = this.vehicle.snapshot()
      this.phase = 'finished'
      const kept = this.fluid.remainingRatio()
      const g = grade(kept)
      this.hud.resultKept.textContent = `${(kept * 100).toFixed(0)}%`
      this.hud.resultTime.textContent = fmtTime(this.elapsed)
      this.hud.resultGrade.textContent = g.letter
      this.hud.resultQuip.textContent = g.quip
      this.hud.result.hidden = false
      this.particles.addPopup(snap.pos.x, snap.pos.y - 3, 'DELIVERED!', true)
    }
  }

  private setText(el: HTMLElement, text: string) {
    if (this.hudCache.get(el) === text) return
    this.hudCache.set(el, text)
    el.textContent = text
  }

  private updateHud(snap: VehicleSnapshot) {
    const kept = this.fluid.remainingRatio()
    this.setText(this.hud.liquid, `${(kept * 100).toFixed(0)}%`)
    const bar = `${(kept * 100).toFixed(1)}%`
    if (this.hudCache.get(this.hud.liquidBar) !== bar) {
      this.hudCache.set(this.hud.liquidBar, bar)
      this.hud.liquidBar.style.width = bar
      this.hud.liquidBar.dataset.level = kept > 0.75 ? 'ok' : kept > 0.4 ? 'warn' : 'bad'
    }
    this.setText(this.hud.speed, (snap.speed * 3.6).toFixed(0))
    this.setText(this.hud.time, fmtTime(this.elapsed))
    this.setText(this.hud.progress, `${(this.track.progress(snap.pos) * 100).toFixed(0)}%`)
    this.setText(this.hud.g, snap.gForce.toFixed(2))
  }

  private frame(now: number) {
    const frameDt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.clock += frameDt

    this.accum += frameDt
    let steps = 0
    while (this.accum >= FIXED_DT && steps < MAX_STEPS) {
      this.simulate(FIXED_DT)
      this.accum -= FIXED_DT
      steps++
    }
    if (steps === MAX_STEPS) this.accum = 0

    const snap = this.vehicle.snapshot(this.fluid.mass())
    this.updateCamera(frameDt, snap)

    const shakeAmp = this.shake * 0.35
    const cam: Camera = {
      x: this.camera.x + (Math.random() - 0.5) * shakeAmp,
      y: this.camera.y + (Math.random() - 0.5) * shakeAmp,
      zoom: this.camera.zoom,
    }
    this.renderer.draw({
      track: this.track,
      car: snap,
      fluid: this.fluid,
      particles: this.particles,
      camera: cam,
      time: this.clock,
      debug: this.debug,
    })

    const s = this.renderer.scale(cam)
    const pr = this.renderer.canvas.width / Math.max(1, this.wrap.clientWidth)
    const hatch = 5 * pr
    const period = hatch * HATCH_PERIOD
    const wrapMod = (v: number) => ((v % period) + period) % period
    this.presenter.present(this.renderer.canvas, {
      worldOffset: [wrapMod(cam.x * s), wrapMod(cam.y * s)],
      inkWidth: Math.max(1, pr),
      hatchSpacing: hatch,
      time: this.clock,
      enabled: this.inkEnabled,
    })

    this.updateHud(snap)
    requestAnimationFrame((t) => this.frame(t))
  }
}
