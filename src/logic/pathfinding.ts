import type { GridState } from '../ecs/world';

export interface Point {
  x: number;
  y: number;
}

export type Walkable = (x: number, y: number) => boolean;

export function findPath(grid: GridState, start: Point, goal: Point, canWalk: Walkable): Point[] {
  const openSet = new Set<number>();
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  const startIdx = indexOf(grid, start.x, start.y);
  const goalIdx = indexOf(grid, goal.x, goal.y);

  openSet.add(startIdx);
  gScore.set(startIdx, 0);
  fScore.set(startIdx, heuristic(start, goal));

  while (openSet.size > 0) {
    const currentIdx = lowestF(openSet, fScore);
    if (currentIdx === goalIdx) {
      return reconstructPath(grid, cameFrom, currentIdx);
    }

    openSet.delete(currentIdx);
    const { x: cx, y: cy } = pointOf(grid, currentIdx);
    const neighbors = neighborPoints(grid, cx, cy);
    for (const neighbor of neighbors) {
      if (!canWalk(neighbor.x, neighbor.y) && indexOf(grid, neighbor.x, neighbor.y) !== goalIdx) {
        continue;
      }
      const neighborIdx = indexOf(grid, neighbor.x, neighbor.y);
      const tentative = (gScore.get(currentIdx) ?? Infinity) + 1;
      if (tentative < (gScore.get(neighborIdx) ?? Infinity)) {
        cameFrom.set(neighborIdx, currentIdx);
        gScore.set(neighborIdx, tentative);
        fScore.set(neighborIdx, tentative + heuristic(neighbor, goal));
        openSet.add(neighborIdx);
      }
    }
  }

  return [];
}

export function findPathBfs(grid: GridState, start: Point, goal: Point, canWalk: Walkable): Point[] {
  const startIdx = indexOf(grid, start.x, start.y);
  const goalIdx = indexOf(grid, goal.x, goal.y);
  if (startIdx === goalIdx) {
    return [start];
  }

  const queue: number[] = [startIdx];
  const visited = new Set<number>([startIdx]);
  const cameFrom = new Map<number, number>();

  while (queue.length > 0) {
    const currentIdx = queue.shift()!;
    if (currentIdx === goalIdx) {
      return reconstructPath(grid, cameFrom, currentIdx);
    }

    const { x: cx, y: cy } = pointOf(grid, currentIdx);
    for (const neighbor of neighborPoints(grid, cx, cy)) {
      const neighborIdx = indexOf(grid, neighbor.x, neighbor.y);
      if (visited.has(neighborIdx)) {
        continue;
      }
      if (!canWalk(neighbor.x, neighbor.y) && neighborIdx !== goalIdx) {
        continue;
      }
      visited.add(neighborIdx);
      cameFrom.set(neighborIdx, currentIdx);
      queue.push(neighborIdx);
    }
  }

  return [];
}

function heuristic(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function lowestF(openSet: Set<number>, fScore: Map<number, number>): number {
  let lowestIdx = -1;
  let lowestValue = Infinity;
  for (const idx of openSet) {
    const value = fScore.get(idx) ?? Infinity;
    if (value < lowestValue) {
      lowestValue = value;
      lowestIdx = idx;
    }
  }
  return lowestIdx;
}

function reconstructPath(grid: GridState, cameFrom: Map<number, number>, current: number): Point[] {
  const path: Point[] = [pointOf(grid, current)];
  let cur = current;
  while (cameFrom.has(cur)) {
    cur = cameFrom.get(cur)!;
    path.push(pointOf(grid, cur));
  }
  path.reverse();
  return path;
}

function neighborPoints(grid: GridState, x: number, y: number): Point[] {
  const points: Point[] = [];
  const candidates = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
  for (const pt of candidates) {
    if (pt.x < 0 || pt.y < 0 || pt.x >= grid.width || pt.y >= grid.height) {
      continue;
    }
    points.push(pt);
  }
  return points;
}

function indexOf(grid: GridState, x: number, y: number): number {
  return y * grid.width + x;
}

function pointOf(grid: GridState, idx: number): Point {
  const x = idx % grid.width;
  const y = Math.floor(idx / grid.width);
  return { x, y };
}
