import * as THREE from 'three'

// =====================================================
// SILHOUETTE EXTRACTION HELPERS (pure functions)
// Extracted verbatim from the original viewer so the
// generation pipeline behaviour is unchanged.
// =====================================================

export type Point = { x: number; y: number }

/**
 * Calculates perpendicular distance from a point to a line segment.
 * Used by the Douglas-Peucker polygon simplification algorithm.
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2)
  }
  return (
    Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(lengthSq)
  )
}

/**
 * Douglas-Peucker polygon simplification.
 * Recursively removes points that deviate less than `epsilon` from the
 * straight line between their neighbors, preserving the overall shape.
 */
export function simplifyContour(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points]

  let maxDist = 0
  let maxIdx = 0
  const start = points[0]
  const end = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end)
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyContour(points.slice(0, maxIdx + 1), epsilon)
    const right = simplifyContour(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [start, end]
}

/**
 * Extracts the outer boundary contour from a binary (thresholded) image
 * using the Moore Neighborhood boundary tracing algorithm.
 */
export function extractContour(data: Uint8ClampedArray, width: number, height: number): Point[] {
  const isObject = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    const r = data[(y * width + x) * 4]
    const a = data[(y * width + x) * 4 + 3]
    return a > 10 && r < 200
  }

  // Step 1: Find the first object pixel (scanning top->bottom, left->right)
  let startX = -1
  let startY = -1
  for (let y = 0; y < height && startX === -1; y++) {
    for (let x = 0; x < width; x++) {
      if (isObject(x, y)) {
        startX = x
        startY = y
        break
      }
    }
  }
  if (startX === -1) return []

  // Step 2: Moore neighborhood directions (8-connected, clockwise)
  const dx = [1, 1, 0, -1, -1, -1, 0, 1]
  const dy = [0, 1, 1, 1, 0, -1, -1, -1]

  const contour: Point[] = []
  let cx = startX
  let cy = startY
  let backDir = 4
  const maxIterations = width * height * 2
  let iterations = 0

  do {
    contour.push({ x: cx, y: cy })

    let found = false
    for (let i = 1; i <= 8; i++) {
      const dir = (backDir + i) % 8
      const nx = cx + dx[dir]
      const ny = cy + dy[dir]

      if (isObject(nx, ny)) {
        backDir = (dir + 4) % 8
        cx = nx
        cy = ny
        found = true
        break
      }
    }

    if (!found) break
    iterations++

    if (contour.length > 2 && cx === startX && cy === startY) break
  } while (iterations < maxIterations)

  return contour
}

/**
 * Ensures a polygon has counter-clockwise winding order.
 * THREE.Shape requires CCW for the outer boundary.
 */
export function ensureCounterClockwise(points: Point[]): Point[] {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  if (area < 0) return [...points].reverse()
  return points
}

/**
 * Full silhouette → THREE.ExtrudeGeometry pipeline.
 * Returns a centered, water-tight extruded geometry or null if the
 * contour is too sparse. Logic mirrors the original viewer exactly.
 */
export function buildExtrudedGeometry(data: Uint8ClampedArray, width: number, height: number): THREE.ExtrudeGeometry | null {
  const rawContour = extractContour(data, width, height)
  if (rawContour.length < 3) return null

  const simplified = simplifyContour(rawContour, 1.0)
  if (simplified.length < 3) return null

  const worldSize = 50
  const shapePoints2D = simplified.map(
    (p) =>
      new THREE.Vector2(
        (p.x / width - 0.5) * worldSize,
        (0.5 - p.y / height) * worldSize,
      ),
  )

  const ccw = ensureCounterClockwise(shapePoints2D.map((v) => ({ x: v.x, y: v.y })))
  const finalPoints = ccw.map((p) => new THREE.Vector2(p.x, p.y))

  const shape = new THREE.Shape(finalPoints)

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 8,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.3,
    bevelOffset: 0,
    bevelSegments: 3,
  }

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  geometry.computeBoundingBox()
  geometry.center()
  return geometry
}
