import { describe, expect, it } from 'vitest'
import { FluidLayer, type FluidFrame } from './FluidLayer'

const still: FluidFrame = { accel: { x: 0, y: 0 }, omega: 0, alpha: 0 }

function run(fluid: FluidLayer, frame: FluidFrame, seconds: number) {
  const spills = []
  for (let t = 0; t < seconds; t += 1 / 120) spills.push(...fluid.step(1 / 120, frame))
  return spills
}

describe('FluidLayer', () => {
  it('starts full and at rest', () => {
    const fluid = new FluidLayer()
    expect(fluid.remainingRatio()).toBeCloseTo(1, 6)
    expect(fluid.sloshSpeed()).toBe(0)
  })

  it('conserves volume exactly while sloshing below the lip', () => {
    const fluid = new FluidLayer()
    const v0 = fluid.volume()
    run(fluid, { accel: { x: 0.9, y: -0.6 }, omega: 0.3, alpha: 0 }, 1.5)
    run(fluid, still, 1)
    expect(fluid.spilledVolume).toBe(0)
    expect(fluid.volume()).toBeCloseTo(v0, 5)
    expect(fluid.sloshSpeed()).toBeGreaterThan(0)
  })

  it('pushes liquid backwards when the car accelerates forward', () => {
    const fluid = new FluidLayer()
    const x0 = fluid.centroidLocal().x
    run(fluid, { accel: { x: 3, y: 0 }, omega: 0, alpha: 0 }, 0.6)
    expect(fluid.centroidLocal().x).toBeLessThan(x0 - 0.02)
  })

  it('pushes liquid to the outside of a turn', () => {
    const fluid = new FluidLayer()
    const y0 = fluid.centroidLocal().y
    // turning right (positive yaw) with centripetal acceleration toward +y
    run(fluid, { accel: { x: 0, y: 4 }, omega: 0.5, alpha: 0 }, 0.6)
    expect(fluid.centroidLocal().y).toBeLessThan(y0 - 0.02)
  })

  it('spills over the lip under hard sustained braking and reports the volume', () => {
    const fluid = new FluidLayer()
    const spills = run(fluid, { accel: { x: -8, y: 0 }, omega: 0, alpha: 0 }, 2)
    const reported = spills.reduce((s, e) => s + e.volume, 0)
    expect(fluid.spilledVolume).toBeGreaterThan(0.005)
    expect(reported).toBeCloseTo(fluid.spilledVolume, 8)
    expect(fluid.volume() + fluid.spilledVolume).toBeCloseTo(fluid.initialVolume, 5)
    const overFront = spills.filter((s) => s.relVel.x > 0).reduce((s, e) => s + e.volume, 0)
    expect(overFront).toBeGreaterThan(reported * 0.5)
  })

  it('keeps liquid in during gentle driving', () => {
    const fluid = new FluidLayer()
    run(fluid, { accel: { x: 1, y: 0.8 }, omega: 0.2, alpha: 0 }, 3)
    expect(fluid.spilledVolume).toBe(0)
  })

  it('reset restores the initial state', () => {
    const fluid = new FluidLayer()
    run(fluid, { accel: { x: -9, y: 3 }, omega: 0, alpha: 0 }, 1)
    fluid.reset()
    expect(fluid.remainingRatio()).toBeCloseTo(1, 6)
    expect(fluid.spilledVolume).toBe(0)
  })
})
