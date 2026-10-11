import type { Vec2 } from '../math/vec2'
import { LIQUID_DENSITY, TRUNK_FILL_DEPTH, TRUNK_LOCAL, TRUNK_WALL_HEIGHT } from './trunkConstants'

/** Rigid-body motion of the tub, expressed in the car-local frame (origin = car center of mass). */
export type FluidFrame = {
  /** Acceleration of the car's center of mass (m/s², car-local axes) */
  accel: Vec2
  /** Yaw rate (rad/s) */
  omega: number
  /** Yaw acceleration (rad/s²) */
  alpha: number
}

export type FluidSpill = {
  /** Car-local point on the tub lip where liquid left */
  local: Vec2
  /** Velocity relative to the car, car-local axes (m/s) */
  relVel: Vec2
  /** Volume (m³) */
  volume: number
}

const G = 9.81
/** Sharp-crested weir: Q = Cd·(2/3)·√(2g)·H^1.5 per meter of lip */
const WEIR_COEFF = 0.6 * (2 / 3) * Math.sqrt(2 * G)
const MAX_SUBSTEP = 1 / 240
const DRY = 1e-5

/**
 * Shallow-water height field on a staggered (MAC) grid inside the trunk tub.
 * Depth lives at cell centers, velocities on faces; solid tub walls are zero-flux faces.
 * The tub is a non-inertial frame, so the solver adds translational, Euler, centrifugal
 * and Coriolis pseudo-accelerations from the car's motion.
 */
export class FluidLayer {
  readonly nx: number
  readonly ny: number
  readonly dx: number
  readonly dy: number
  readonly wallHeight: number
  readonly h: Float32Array
  readonly initialVolume: number
  spilledVolume = 0

  private readonly fillDepth: number
  private readonly u: Float32Array
  private readonly v: Float32Array
  private readonly fluxX: Float32Array
  private readonly fluxY: Float32Array
  private readonly scale: Float32Array
  private readonly cellArea: number
  private readonly spillAcc: Float64Array
  private readonly spillSpeed: Float64Array

  constructor(nx = 20, ny = 22, fillDepth = TRUNK_FILL_DEPTH, wallHeight = TRUNK_WALL_HEIGHT) {
    this.nx = nx
    this.ny = ny
    this.dx = (TRUNK_LOCAL.maxX - TRUNK_LOCAL.minX) / nx
    this.dy = (TRUNK_LOCAL.maxY - TRUNK_LOCAL.minY) / ny
    this.cellArea = this.dx * this.dy
    this.fillDepth = fillDepth
    this.wallHeight = wallHeight

    this.h = new Float32Array(nx * ny).fill(fillDepth)
    this.u = new Float32Array((nx + 1) * ny)
    this.v = new Float32Array(nx * (ny + 1))
    this.fluxX = new Float32Array((nx + 1) * ny)
    this.fluxY = new Float32Array(nx * (ny + 1))
    this.scale = new Float32Array(nx * ny)
    this.spillAcc = new Float64Array(2 * (nx + ny))
    this.spillSpeed = new Float64Array(2 * (nx + ny))
    this.initialVolume = this.volume()
  }

  reset() {
    this.h.fill(this.fillDepth)
    this.u.fill(0)
    this.v.fill(0)
    this.spilledVolume = 0
  }

  heightAt(i: number, j: number): number {
    return this.h[j * this.nx + i]
  }

  /** Liquid volume in the tub (m³) */
  volume(): number {
    let s = 0
    for (let k = 0; k < this.h.length; k++) s += this.h[k]
    return s * this.cellArea
  }

  mass(): number {
    return this.volume() * LIQUID_DENSITY
  }

  remainingRatio(): number {
    return Math.max(0, Math.min(1, this.volume() / this.initialVolume))
  }

  /** Liquid center of mass in car-local coordinates */
  centroidLocal(): Vec2 {
    let mx = 0
    let my = 0
    let m = 0
    for (let j = 0; j < this.ny; j++) {
      const y = TRUNK_LOCAL.minY + (j + 0.5) * this.dy
      for (let i = 0; i < this.nx; i++) {
        const w = this.h[j * this.nx + i]
        mx += (TRUNK_LOCAL.minX + (i + 0.5) * this.dx) * w
        my += y * w
        m += w
      }
    }
    if (m < DRY) {
      return { x: (TRUNK_LOCAL.minX + TRUNK_LOCAL.maxX) / 2, y: (TRUNK_LOCAL.minY + TRUNK_LOCAL.maxY) / 2 }
    }
    return { x: mx / m, y: my / m }
  }

  /** RMS face speed (m/s), a cheap measure of slosh energy */
  sloshSpeed(): number {
    let s = 0
    for (let k = 0; k < this.u.length; k++) s += this.u[k] * this.u[k]
    for (let k = 0; k < this.v.length; k++) s += this.v[k] * this.v[k]
    return Math.sqrt(s / (this.u.length + this.v.length))
  }

  step(dt: number, frame: FluidFrame): FluidSpill[] {
    const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP))
    const sub = dt / n
    this.spillAcc.fill(0)
    this.spillSpeed.fill(0)
    for (let s = 0; s < n; s++) this.substep(sub, frame)
    return this.collectSpills()
  }

  private substep(dt: number, f: FluidFrame) {
    const { nx, ny, dx, dy, h, u, v } = this
    const { accel, omega, alpha } = f
    const w2 = omega * omega
    const damp = 1 / (1 + 0.45 * dt)
    const vmax = 0.45 * Math.min(dx, dy) / dt

    // x-faces: face i sits between cells i-1 and i
    for (let j = 0; j < ny; j++) {
      const ry = TRUNK_LOCAL.minY + (j + 0.5) * dy
      for (let i = 1; i < nx; i++) {
        const k = j * (nx + 1) + i
        const hl = h[j * nx + i - 1]
        const hr = h[j * nx + i]
        if (hl < DRY && hr < DRY) {
          u[k] = 0
          continue
        }
        const rx = TRUNK_LOCAL.minX + i * dx
        const vbar =
          0.25 * (v[j * nx + i - 1] + v[j * nx + i] + v[(j + 1) * nx + i - 1] + v[(j + 1) * nx + i])
        const pseudo = -accel.x + alpha * ry + w2 * rx + 2 * omega * vbar
        const next = (u[k] + dt * (-G * (hr - hl) / dx + pseudo)) * damp
        u[k] = Math.max(-vmax, Math.min(vmax, next))
      }
    }

    // y-faces: face j sits between cells j-1 and j
    for (let j = 1; j < ny; j++) {
      const ry = TRUNK_LOCAL.minY + j * dy
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        const hb = h[(j - 1) * nx + i]
        const ht = h[j * nx + i]
        if (hb < DRY && ht < DRY) {
          v[k] = 0
          continue
        }
        const rx = TRUNK_LOCAL.minX + (i + 0.5) * dx
        const ubar =
          0.25 *
          (u[(j - 1) * (nx + 1) + i] + u[(j - 1) * (nx + 1) + i + 1] + u[j * (nx + 1) + i] + u[j * (nx + 1) + i + 1])
        const pseudo = -accel.y - alpha * rx + w2 * ry - 2 * omega * ubar
        const next = (v[k] + dt * (-G * (ht - hb) / dy + pseudo)) * damp
        v[k] = Math.max(-vmax, Math.min(vmax, next))
      }
    }

    this.advectHeights(dt)
    this.spillOverLip(dt)
  }

  /** Upwind fluxes with an outflow limiter so no cell drains below zero (exact mass conservation). */
  private advectHeights(dt: number) {
    const { nx, ny, dx, dy, h, u, v, fluxX, fluxY, scale } = this

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i
        if (i === 0 || i === nx) {
          fluxX[k] = 0
          continue
        }
        const vel = u[k]
        fluxX[k] = vel * (vel > 0 ? h[j * nx + i - 1] : h[j * nx + i])
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        if (j === 0 || j === ny) {
          fluxY[k] = 0
          continue
        }
        const vel = v[k]
        fluxY[k] = vel * (vel > 0 ? h[(j - 1) * nx + i] : h[j * nx + i])
      }
    }

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        const out =
          (dt *
            (Math.max(0, fluxX[j * (nx + 1) + i + 1]) + Math.max(0, -fluxX[j * (nx + 1) + i]))) /
            dx +
          (dt * (Math.max(0, fluxY[(j + 1) * nx + i]) + Math.max(0, -fluxY[j * nx + i]))) / dy
        scale[c] = out > h[c] && out > 0 ? h[c] / out : 1
      }
    }

    for (let j = 0; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const k = j * (nx + 1) + i
        fluxX[k] *= fluxX[k] > 0 ? scale[j * nx + i - 1] : scale[j * nx + i]
      }
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        fluxY[k] *= fluxY[k] > 0 ? scale[(j - 1) * nx + i] : scale[j * nx + i]
      }
    }

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        const div =
          (fluxX[j * (nx + 1) + i + 1] - fluxX[j * (nx + 1) + i]) / dx +
          (fluxY[(j + 1) * nx + i] - fluxY[j * nx + i]) / dy
        h[c] = Math.max(0, h[c] - dt * div)
      }
    }
  }

  /** Lip slots: -y edges [0, nx), +y edges [nx, 2nx), -x edges [2nx, 2nx+ny), +x edges after. */
  private spillOverLip(dt: number) {
    const { nx, ny, dx, dy, h, cellArea, wallHeight } = this
    const pour = (c: number, slot: number, edgeLen: number) => {
      const excess = h[c] - wallHeight
      if (excess <= 0) return
      const dV = Math.min(WEIR_COEFF * Math.pow(excess, 1.5) * edgeLen * dt, excess * cellArea * 0.5)
      h[c] -= dV / cellArea
      this.spilledVolume += dV
      this.spillAcc[slot] += dV
      this.spillSpeed[slot] = Math.max(this.spillSpeed[slot], Math.sqrt(2 * G * excess))
    }
    for (let i = 0; i < nx; i++) {
      pour(i, i, dx)
      pour((ny - 1) * nx + i, nx + i, dx)
    }
    for (let j = 0; j < ny; j++) {
      pour(j * nx, 2 * nx + j, dy)
      pour(j * nx + nx - 1, 2 * nx + ny + j, dy)
    }
  }

  private collectSpills(): FluidSpill[] {
    const { nx, ny, dx, dy } = this
    const spills: FluidSpill[] = []
    for (let slot = 0; slot < this.spillAcc.length; slot++) {
      const volume = this.spillAcc[slot]
      if (volume <= 0) continue
      const speed = this.spillSpeed[slot]
      let local: Vec2
      let normal: Vec2
      if (slot < nx) {
        local = { x: TRUNK_LOCAL.minX + (slot + 0.5) * dx, y: TRUNK_LOCAL.minY }
        normal = { x: 0, y: -1 }
      } else if (slot < 2 * nx) {
        local = { x: TRUNK_LOCAL.minX + (slot - nx + 0.5) * dx, y: TRUNK_LOCAL.maxY }
        normal = { x: 0, y: 1 }
      } else if (slot < 2 * nx + ny) {
        local = { x: TRUNK_LOCAL.minX, y: TRUNK_LOCAL.minY + (slot - 2 * nx + 0.5) * dy }
        normal = { x: -1, y: 0 }
      } else {
        local = { x: TRUNK_LOCAL.maxX, y: TRUNK_LOCAL.minY + (slot - 2 * nx - ny + 0.5) * dy }
        normal = { x: 1, y: 0 }
      }
      spills.push({ local, relVel: { x: normal.x * speed, y: normal.y * speed }, volume })
    }
    return spills
  }
}
