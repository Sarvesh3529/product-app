/**
 * silhouette.ts
 *
 * Marching Squares contour tracer.
 * Given a binary (boolean) 2-D grid, returns a set of closed polygon loops
 * as arrays of { x, y } points in grid-cell coordinates.
 *
 * The algorithm uses the standard 4-bit Marching-Squares lookup table to
 * classify each 2×2 cell and trace the midpoint isocontour.  Ambiguous cases
 * (index 5 and 10) are resolved by examining the average value of the cell.
 */

export type Point2D = { x: number; y: number };

/** Classify each 2×2 cell with a 4-bit index (tl, tr, br, bl → bits 3,2,1,0). */
function cellIndex(grid: boolean[][], row: number, col: number): number {
  const tl = grid[row][col] ? 1 : 0;
  const tr = grid[row][col + 1] ? 1 : 0;
  const br = grid[row + 1][col + 1] ? 1 : 0;
  const bl = grid[row + 1][col] ? 1 : 0;
  return (tl << 3) | (tr << 2) | (br << 1) | bl;
}

/**
 * Midpoint helpers – returns the midpoint coordinate between two adjacent
 * cell corners in normalised grid units.
 */
const midN = (c: number) => ({ x: c + 0.5, y: 0 });   // not used standalone
const midS = (c: number) => ({ x: c + 0.5, y: 1 });
const midW = (r: number) => ({ x: 0, y: r + 0.5 });
const midE = (r: number) => ({ x: 1, y: r + 0.5 });

/** Segment: two { x, y } points in local cell space. */
type Segment = [Point2D, Point2D];

/**
 * Returns one or two line segments for a given 2×2 cell at (row, col).
 * Coordinates are in global grid-space (adding row/col offset).
 */
function cellSegments(grid: boolean[][], row: number, col: number): Segment[] {
  const idx = cellIndex(grid, row, col);

  const n = { x: col + 0.5, y: row };
  const s = { x: col + 0.5, y: row + 1 };
  const w = { x: col, y: row + 0.5 };
  const e = { x: col + 1, y: row + 0.5 };

  // Lookup table — 16 cases
  switch (idx) {
    case 0:  return [];
    case 1:  return [[s, w]];
    case 2:  return [[e, s]];
    case 3:  return [[e, w]];
    case 4:  return [[n, e]];
    case 5: {
      // Ambiguous – resolve by saddle-point average
      const avg = (
        (grid[row][col] ? 1 : 0) +
        (grid[row][col + 1] ? 1 : 0) +
        (grid[row + 1][col + 1] ? 1 : 0) +
        (grid[row + 1][col] ? 1 : 0)
      ) / 4;
      return avg >= 0.5
        ? [[n, w], [e, s]]
        : [[n, e], [s, w]];
    }
    case 6:  return [[n, s]];
    case 7:  return [[n, w]];
    case 8:  return [[w, n]];
    case 9:  return [[s, n]];
    case 10: {
      const avg = (
        (grid[row][col] ? 1 : 0) +
        (grid[row][col + 1] ? 1 : 0) +
        (grid[row + 1][col + 1] ? 1 : 0) +
        (grid[row + 1][col] ? 1 : 0)
      ) / 4;
      return avg >= 0.5
        ? [[w, s], [n, e]]
        : [[w, n], [s, e]];
    }
    case 11: return [[e, n]];
    case 12: return [[w, e]];
    case 13: return [[s, e]];
    case 14: return [[w, s]];
    case 15: return [];
    default: return [];
  }
}

/** Key for a point – used to stitch segments into polylines. */
const key = (p: Point2D) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;

/**
 * Assembles individual Marching-Squares edge segments into closed loops.
 */
function assembleLoops(segments: Segment[]): Point2D[][] {
  // Build adjacency map: point-key → array of neighbour point-keys
  const adj = new Map<string, Point2D[]>();
  for (const [a, b] of segments) {
    const ka = key(a), kb = key(b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka)!.push(b);
    adj.get(kb)!.push(a);
  }

  const visited = new Set<string>();
  const loops: Point2D[][] = [];

  for (const [startKey, neighbours] of adj) {
    if (visited.has(startKey) || neighbours.length === 0) continue;

    const loop: Point2D[] = [];
    let current = neighbours[0]; // first point in segment
    // find the actual start point from key
    const [sx, sy] = startKey.split(",").map(Number);
    let prev: Point2D = { x: sx, y: sy };
    loop.push(prev);
    visited.add(startKey);

    // walk chain
    while (true) {
      const currKey = key(current);
      if (currKey === startKey) break; // closed loop
      if (visited.has(currKey)) break;

      loop.push(current);
      visited.add(currKey);

      const nexts = adj.get(currKey) || [];
      const prevKey = key(prev);
      const next = nexts.find(p => key(p) !== prevKey);
      if (!next) break;

      prev = current;
      current = next;
    }

    if (loop.length >= 4) loops.push(loop);
  }

  return loops;
}

/**
 * High-level entry point.
 *
 * @param grid   A rows×cols boolean 2-D array (true = inside silhouette).
 * @returns      An array of closed contour loops in grid-space coordinates.
 */
export function traceContours(grid: boolean[][]): Point2D[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows < 2 || cols < 2) return [];

  const segments: Segment[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const segs = cellSegments(grid, r, c);
      segments.push(...segs);
    }
  }

  return assembleLoops(segments);
}
