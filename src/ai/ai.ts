import { chebyshev, hunterCanReach, inBounds, manhattan, samePos } from '../geo.js';
import type { Pos } from '../types.js';

function mobility(from: Pos, hunter: Pos, size: number, maxStep: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const next = { x: from.x + dx, y: from.y + dy };
      if (!inBounds(next, size) || samePos(next, hunter)) {
        continue;
      }
      if (!hunterCanReach(hunter, next, maxStep)) {
        count += 1;
      }
    }
  }
  return count;
}

function score(
  dest: Pos,
  hunter: Pos,
  size: number,
  maxStep: number,
  patrolCells: Pos[],
  trap: Pos | null,
): number {
  if (samePos(dest, hunter) || (trap && samePos(dest, trap))) {
    return -10_000;
  }

  let value = 0;
  if (hunterCanReach(hunter, dest, maxStep)) {
    value -= 600;
  }
  if (patrolCells.some((pos) => samePos(pos, dest))) {
    value -= 450;
  }

  value += manhattan(dest, hunter) * 12;
  value += chebyshev(dest, hunter) * 10;

  const dx = Math.abs(dest.x - hunter.x);
  const dy = Math.abs(dest.y - hunter.y);
  if (dx > 0 && dy > 0) {
    value += 28;
  }

  value += mobility(dest, hunter, size, maxStep) * 6;

  const edge = Math.min(dest.x, dest.y, size - 1 - dest.x, size - 1 - dest.y);
  value += edge * 2;
  value += Math.random() * 4;

  return value;
}

export function chooseWitchMove(
  options: Pos[],
  hunter: Pos,
  size: number,
  maxStep = 2,
  from?: Pos,
  patrolCells: Pos[] = [],
  trap: Pos | null = null,
): Pos {
  if (options.length === 0) {
    return { x: hunter.x, y: hunter.y };
  }

  const stay = from ? options.find((pos) => samePos(pos, from)) : undefined;
  const moves = from ? options.filter((pos) => !samePos(pos, from)) : options;
  const pool = moves.length > 0 ? moves : options;

  let best = pool[0];
  let bestScore = -Infinity;
  for (const option of pool) {
    const value = score(option, hunter, size, maxStep, patrolCells, trap);
    if (value > bestScore) {
      best = option;
      bestScore = value;
    }
  }

  if (
    stay &&
    (samePos(best, hunter) ||
      hunterCanReach(hunter, best, maxStep) ||
      (trap !== null && samePos(best, trap)))
  ) {
    return { ...stay };
  }

  return { ...best };
}
