import { DIR_BY_KEY, type DirKey, type Pos } from './types.js';

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

export function inBounds(pos: Pos, size: number): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function cellsAtManhattan(from: Pos, distance: number, size: number): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pos = { x, y };
      if (manhattan(from, pos) === distance) {
        out.push(pos);
      }
    }
  }
  return out;
}

export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function centerPos(size: number): Pos {
  const c = Math.floor(size / 2);
  return { x: c, y: c };
}

export function directionOf(from: Pos, to: Pos): DirKey {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const found = Object.values(DIR_BY_KEY).find((d) => d.dx === dx && d.dy === dy);
  return found?.key ?? 'STAY';
}

export function withoutCell(cells: Pos[], banned: Pos): Pos[] {
  return cells.filter((p) => !samePos(p, banned));
}

export function shiftCells(cells: Pos[], dx: number, dy: number): Pos[] {
  const out: Pos[] = [];
  for (const cell of cells) {
    const next = { x: cell.x + dx, y: cell.y + dy };
    if (out.some((p) => samePos(p, next))) {
      continue;
    }
    out.push(next);
  }
  return out;
}

export function hunterCanReach(from: Pos, to: Pos, maxStep = 2): boolean {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  return (dx === 0 && dy >= 1 && dy <= maxStep) || (dy === 0 && dx >= 1 && dx <= maxStep);
}
