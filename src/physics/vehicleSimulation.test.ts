import { describe, expect, it } from 'vitest'
import { Track } from '../world/Track'
import { FluidLayer } from './FluidLayer'
import { VehicleSimulation, type DriveInput } from './VehicleSimulation'

const DT = 1 / 120

function setup(seed = 3) {
  const track = new Track(seed)
  const vehicle = new VehicleSimulation()
  const fluid = new FluidLayer()
  vehicle.reset(track)
  return { track, vehicle, fluid }
}

function drive(ctx: ReturnType<typeof setup>, input: DriveInput, seconds: number) {
  for (let t = 0; t < seconds; t += DT) {
    ctx.vehicle.step(DT, input, ctx.track, ctx.fluid)
    ctx.fluid.step(DT, ctx.vehicle.fluidFrame())
  }
  return ctx.vehicle.snapshot()
}

describe('VehicleSimulation', () => {
  it('stays at rest with no input', () => {
    const ctx = setup()
    const snap = drive(ctx, { throttle: 0, steer: 0 }, 2)
    expect(snap.speed).toBeLessThan(0.05)
    expect(ctx.fluid.spilledVolume).toBe(0)
  })

  it('accelerates like a road car', () => {
    const ctx = setup()
    const snap = drive(ctx, { throttle: 1, steer: 0 }, 4)
    expect(Number.isFinite(snap.pos.x)).toBe(true)
    // ~0.3–0.6 g of launch acceleration
    expect(snap.speed).toBeGreaterThan(8)
    expect(snap.speed).toBeLessThan(26)
  })

  it('brakes to a stop', () => {
    const ctx = setup()
    drive(ctx, { throttle: 1, steer: 0 }, 3)
    const snap = drive(ctx, { throttle: -1, steer: 0 }, 1.8)
    expect(snap.speed).toBeLessThan(1.5)
  })

  it('turns toward the steering direction', () => {
    const ctx = setup()
    drive(ctx, { throttle: 0.6, steer: 0 }, 2)
    const before = ctx.vehicle.snapshot().angle
    drive(ctx, { throttle: 0.4, steer: 1 }, 1)
    expect(ctx.vehicle.snapshot().angle).toBeGreaterThan(before + 0.3)
  })

  it('sloshes liquid backwards under acceleration and carries its mass', () => {
    const ctx = setup()
    const x0 = ctx.fluid.centroidLocal().x
    drive(ctx, { throttle: 1, steer: 0 }, 0.5)
    expect(ctx.fluid.centroidLocal().x).toBeLessThan(x0)
    expect(ctx.vehicle.snapshot(ctx.fluid.mass()).liquidMass).toBeGreaterThan(300)
  })

  it('remains finite through long chaotic driving', () => {
    const ctx = setup(11)
    for (let i = 0; i < 40; i++) {
      drive(ctx, { throttle: Math.sin(i) > -0.3 ? 1 : -1, steer: Math.cos(i * 1.7), handbrake: i % 7 === 0 }, 0.5)
    }
    const snap = ctx.vehicle.snapshot()
    expect(Number.isFinite(snap.pos.x) && Number.isFinite(snap.pos.y) && Number.isFinite(snap.angle)).toBe(true)
    expect(snap.speed).toBeLessThan(60)
    expect(ctx.fluid.volume() + ctx.fluid.spilledVolume).toBeCloseTo(ctx.fluid.initialVolume, 4)
  })
})

describe('driving skill vs. spill', () => {
  function pursuit(seed: number, cruise: number, seconds: number) {
    const ctx = setup(seed)
    for (let t = 0; t < seconds; t += DT) {
      const snap = ctx.vehicle.snapshot()
      const along = ctx.track.query(snap.pos).along
      const target = ctx.track.pointAt(along + 10 + snap.speed * 0.6).p
      let err = Math.atan2(target.y - snap.pos.y, target.x - snap.pos.x) - snap.angle
      err = Math.atan2(Math.sin(err), Math.cos(err))
      const input = {
        throttle: snap.speed < cruise - Math.abs(err) * 22 ? 0.5 : -0.2,
        steer: Math.max(-1, Math.min(1, err * 2.2)),
      }
      ctx.vehicle.step(DT, input, ctx.track, ctx.fluid)
      ctx.fluid.step(DT, ctx.vehicle.fluidFrame())
    }
    return ctx
  }

  it('a smooth driver delivers nearly everything; a reckless one does not', () => {
    for (const seed of [2, 6]) {
      const careful = pursuit(seed, 14, 14)
      expect(careful.vehicle.snapshot().onRoad).toBe(true)
      expect(careful.fluid.remainingRatio()).toBeGreaterThan(0.95)
    }
    const reckless = pursuit(6, 30, 14)
    expect(reckless.fluid.remainingRatio()).toBeLessThan(0.9)
  })
})
