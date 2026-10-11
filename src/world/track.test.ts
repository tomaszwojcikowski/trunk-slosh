import { describe, expect, it } from 'vitest'
import { Track } from './Track'

describe('Track', () => {
  it('is deterministic for a seed', () => {
    const a = new Track(12345)
    const b = new Track(12345)
    expect(a.segments.length).toBe(b.segments.length)
    expect(a.finish).toEqual(b.finish)
    expect(a.obstacles.length).toBe(b.obstacles.length)
  })

  it('builds a route of sensible length', () => {
    const track = new Track(99)
    expect(track.totalLength).toBeGreaterThan(400)
    expect(track.leftEdge.length).toBe(track.centerline.length)
  })

  it('starts on the road and progresses monotonically along the centerline', () => {
    const track = new Track(7)
    expect(track.query(track.start).onRoad).toBe(true)
    let last = -1
    const span = track.finishS - track.startS
    for (let s = track.startS; s <= track.finishS + 1e-6; s += span / 20) {
      const p = track.progress(track.pointAt(s).p)
      expect(p).toBeGreaterThanOrEqual(last - 1e-6)
      last = p
    }
    expect(last).toBeCloseTo(1, 3)
  })

  it('keeps obstacles off the road', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const track = new Track(seed)
      expect(track.obstacles.length).toBeGreaterThan(20)
      for (const o of track.obstacles) {
        expect(track.query(o).dist).toBeGreaterThan(track.roadWidth / 2 + o.r)
      }
    }
  })
})
