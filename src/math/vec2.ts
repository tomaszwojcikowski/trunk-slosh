export type Vec2 = { x: number; y: number }

export function rotate(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

export function len(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}

export function normalize(v: Vec2): Vec2 {
  const l = len(v)
  if (l < 1e-8) return { x: 0, y: 0 }
  return { x: v.x / l, y: v.y / l }
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}
