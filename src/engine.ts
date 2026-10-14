import { chooseWitchMove } from './ai/jev.js';
import { copy } from './copy.js';
import {
  cellsAtManhattan,
  centerPos,
  directionOf,
  hunterCanReach,
  inBounds,
  lineCells,
  manhattan,
  samePos,
} from './geo.js';
import {
  DEFAULT_CONFIG,
  DIR_BY_KEY,
  type ApplyMoveResult,
  type DirKey,
  type GameConfig,
  type GameState,
  type HistoryEntry,
  type HunterAction,
  type LineAxis,
  type Pos,
} from './types.js';

export function clampConfig(partial: Partial<GameConfig> = {}): GameConfig {
  const boardSize = Math.min(15, Math.max(3, Math.round(partial.boardSize ?? DEFAULT_CONFIG.boardSize)));
  const maxTurns = Math.min(99, Math.max(1, Math.round(partial.maxTurns ?? DEFAULT_CONFIG.maxTurns)));
  return {
    boardSize,
    maxTurns,
  };
}

export function hunterMoves(from: Pos, size: number, maxStep = 2): Pos[] {
  const deltas: Pos[] = [];
  for (let step = 1; step <= maxStep; step += 1) {
    deltas.push({ x: 0, y: -step }, { x: 0, y: step }, { x: -step, y: 0 }, { x: step, y: 0 });
  }
  return deltas
    .map((d) => ({ x: from.x + d.x, y: from.y + d.y }))
    .filter((p) => inBounds(p, size));
}

export function witchMoves(from: Pos, size: number): Pos[] {
  const out: Pos[] = [{ ...from }];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const next = { x: from.x + dx, y: from.y + dy };
      if (inBounds(next, size)) {
        out.push(next);
      }
    }
  }
  return out;
}

function cloneState(state: GameState): GameState {
  return {
    config: { ...state.config },
    hunter: { ...state.hunter },
    witch: { ...state.witch },
    turn: state.turn,
    phase: state.phase,
    history: state.history.map((entry) => ({
      ...entry,
      hunterFrom: { ...entry.hunterFrom },
      hunterTo: { ...entry.hunterTo },
      witchFrom: { ...entry.witchFrom },
      witchTo: { ...entry.witchTo },
    })),
    lastManhattan: state.lastManhattan,
    manhattanRing: state.manhattanRing.map((pos) => ({ ...pos })),
    rumoursAvailable: state.rumoursAvailable,
    patrolAvailable: state.patrolAvailable,
    patrolCells: state.patrolCells.map((pos) => ({ ...pos })),
    patrolHit: state.patrolHit,
    houndsAvailable: state.houndsAvailable,
    hounds: state.hounds.map((pos) => ({ ...pos })),
    trapAvailable: state.trapAvailable,
    trap: state.trap ? { ...state.trap } : null,
    debug: state.debug,
    pendingHunterFrom: state.pendingHunterFrom ? { ...state.pendingHunterFrom } : null,
  };
}

function pickWitchSpawn(size: number, hunter: Pos): Pos {
  const candidates: Pos[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pos = { x, y };
      if (samePos(pos, hunter)) {
        continue;
      }
      if (manhattan(pos, hunter) >= Math.max(2, Math.floor(size / 2))) {
        candidates.push(pos);
      }
    }
  }
  const pool = candidates.length > 0 ? candidates : [{ x: 0, y: 0 }];
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}

export const HOUND_COUNT = 3;

function shiftHounds(state: GameState, direction: DirKey): void {
  if (direction === 'STAY' || state.hounds.length === 0) {
    return;
  }
  const step = DIR_BY_KEY[direction];
  const size = state.config.boardSize;
  state.hounds = state.hounds
    .map((pos) => ({ x: pos.x + step.dx, y: pos.y + step.dy }))
    .filter((pos) => inBounds(pos, size));
}

function pulseDistance(state: GameState): void {
  const distance = manhattan(state.hunter, state.witch);
  state.lastManhattan = distance;
  state.manhattanRing = cellsAtManhattan(state.hunter, distance, state.config.boardSize);
}

function expireHitPatrol(state: GameState): void {
  if (state.patrolHit) {
    state.patrolCells = [];
    state.patrolHit = false;
  }
}

function triggerPatrolIfOccupied(state: GameState): void {
  if (state.patrolHit || state.patrolCells.length === 0) {
    return;
  }
  if (!state.patrolCells.some((pos) => samePos(pos, state.witch))) {
    return;
  }
  state.patrolHit = true;
  recordAction(state, 'patrolHit');
}

function beginResolving(state: GameState): void {
  state.pendingHunterFrom = { ...state.hunter };
  state.phase = 'resolving';
}

function recordAction(state: GameState, action: HunterAction, manhattanDistance: number | null = null): void {
  state.history.push({
    turn: state.turn,
    hunterFrom: { ...state.hunter },
    hunterTo: { ...state.hunter },
    witchFrom: { ...state.witch },
    witchTo: { ...state.witch },
    direction: 'STAY',
    manhattan: manhattanDistance,
    action,
  });
}

export function createGame(partial: Partial<GameConfig> = {}, debug = false): GameState {
  const config = clampConfig(partial);
  const hunter = centerPos(config.boardSize);
  const witch = pickWitchSpawn(config.boardSize, hunter);
  const state: GameState = {
    config,
    hunter,
    witch,
    turn: 1,
    phase: 'hunter',
    history: [],
    lastManhattan: null,
    manhattanRing: [],
    rumoursAvailable: true,
    patrolAvailable: true,
    patrolCells: [],
    patrolHit: false,
    houndsAvailable: true,
    hounds: [],
    trapAvailable: true,
    trap: null,
    debug,
    pendingHunterFrom: null,
  };
  return state;
}

export function applyHunterMove(state: GameState, to: Pos): ApplyMoveResult {
  if (state.phase !== 'hunter') {
    return { ok: false, reason: copy.engine.notHunterTurn, state };
  }
  if (!hunterCanReach(state.hunter, to) || !inBounds(to, state.config.boardSize)) {
    return { ok: false, reason: copy.engine.stepNotAllowed, state };
  }

  const next = cloneState(state);
  expireHitPatrol(next);
  next.manhattanRing = [];
  next.pendingHunterFrom = { ...next.hunter };
  next.hunter = { ...to };

  if (samePos(next.hunter, next.witch)) {
    next.phase = 'won';
    next.pendingHunterFrom = null;
    return { ok: true, state: next };
  }

  next.phase = 'resolving';
  return { ok: true, state: next };
}

export function useRumours(state: GameState): ApplyMoveResult {
  if (state.phase !== 'hunter') {
    return { ok: false, reason: copy.engine.notHunterTurn, state };
  }
  if (!state.rumoursAvailable) {
    return { ok: false, reason: copy.engine.rumoursSpent, state };
  }

  const next = cloneState(state);
  expireHitPatrol(next);
  next.rumoursAvailable = false;
  pulseDistance(next);
  recordAction(next, 'rumours', next.lastManhattan);
  beginResolving(next);
  return { ok: true, state: next };
}

export function usePatrol(state: GameState, axis: LineAxis, index: number): ApplyMoveResult {
  if (state.phase !== 'hunter') {
    return { ok: false, reason: copy.engine.notHunterTurn, state };
  }
  if (!state.patrolAvailable) {
    return { ok: false, reason: copy.engine.patrolSpent, state };
  }
  const size = state.config.boardSize;
  if (index < 0 || index >= size) {
    return { ok: false, reason: copy.engine.stepNotAllowed, state };
  }

  const next = cloneState(state);
  expireHitPatrol(next);
  next.patrolAvailable = false;
  next.patrolCells = lineCells(axis, index, size);
  next.patrolHit = false;
  recordAction(next, 'patrol');
  triggerPatrolIfOccupied(next);
  beginResolving(next);
  return { ok: true, state: next };
}

export function useHounds(state: GameState, cells: Pos[]): ApplyMoveResult {
  if (state.phase !== 'hunter') {
    return { ok: false, reason: copy.engine.notHunterTurn, state };
  }
  if (!state.houndsAvailable) {
    return { ok: false, reason: copy.engine.houndsSpent, state };
  }
  const size = state.config.boardSize;
  const unique: Pos[] = [];
  for (const cell of cells) {
    if (!inBounds(cell, size) || unique.some((pos) => samePos(pos, cell))) {
      return { ok: false, reason: copy.engine.houndsNeedThree, state };
    }
    unique.push({ ...cell });
  }
  if (unique.length !== HOUND_COUNT) {
    return { ok: false, reason: copy.engine.houndsNeedThree, state };
  }

  const next = cloneState(state);
  expireHitPatrol(next);
  next.houndsAvailable = false;
  next.hounds = unique;
  recordAction(next, 'hounds');
  beginResolving(next);
  return { ok: true, state: next };
}

export function useTrap(state: GameState, cell: Pos): ApplyMoveResult {
  if (state.phase !== 'hunter') {
    return { ok: false, reason: copy.engine.notHunterTurn, state };
  }
  if (!state.trapAvailable) {
    return { ok: false, reason: copy.engine.trapSpent, state };
  }
  if (!inBounds(cell, state.config.boardSize)) {
    return { ok: false, reason: copy.engine.stepNotAllowed, state };
  }

  const next = cloneState(state);
  expireHitPatrol(next);
  next.trapAvailable = false;
  if (samePos(cell, next.witch)) {
    next.trap = null;
    recordAction(next, 'trapBroke');
  } else {
    next.trap = { ...cell };
    recordAction(next, 'trap');
  }
  beginResolving(next);
  return { ok: true, state: next };
}

export async function resolveWitchTurn(state: GameState): Promise<ApplyMoveResult> {
  if (state.phase !== 'resolving') {
    return { ok: false, reason: copy.engine.witchNotMoving, state };
  }

  const next = cloneState(state);
  const hunterFrom = next.pendingHunterFrom ?? { ...next.hunter };
  const options = witchMoves(next.witch, next.config.boardSize);
  const witchFrom = { ...next.witch };
  const witchTo = await chooseWitchMove({
    boardSize: next.config.boardSize,
    maxTurns: next.config.maxTurns,
    turn: next.turn,
    hunter: next.hunter,
    witch: next.witch,
    hunterMaxStep: 2,
    canStay: true,
    lastManhattan: next.lastManhattan,
    rumoursAvailable: next.rumoursAvailable,
    patrolAvailable: next.patrolAvailable,
    patrolCells: next.patrolCells,
    houndsAvailable: next.houndsAvailable,
    hounds: next.hounds,
    trapAvailable: next.trapAvailable,
    trap: next.trap,
    options,
    hunterReachableNextTurn: hunterMoves(next.hunter, next.config.boardSize),
  });
  next.witch = { ...witchTo };

  const direction = directionOf(witchFrom, witchTo);
  shiftHounds(next, direction);

  next.history.push(
    record(next, hunterFrom, witchFrom, witchTo, direction),
  );
  next.pendingHunterFrom = null;

  if (next.trap && samePos(next.witch, next.trap)) {
    recordAction(next, 'trapCaught');
    next.phase = 'won';
    return { ok: true, state: next };
  }

  triggerPatrolIfOccupied(next);

  if (samePos(next.hunter, next.witch)) {
    next.phase = 'won';
    return { ok: true, state: next };
  }

  if (next.turn >= next.config.maxTurns) {
    next.phase = 'lost';
    return { ok: true, state: next };
  }

  next.turn += 1;
  next.phase = 'hunter';
  return { ok: true, state: next };
}

function record(
  state: GameState,
  hunterFrom: Pos,
  witchFrom: Pos,
  witchTo: Pos,
  direction: DirKey,
  manhattanDistance: number | null = null,
  turn: number = state.turn,
): HistoryEntry {
  return {
    turn,
    hunterFrom,
    hunterTo: { ...state.hunter },
    witchFrom,
    witchTo,
    direction,
    manhattan: manhattanDistance,
    action: null,
  };
}

export function setDebug(state: GameState, debug: boolean): GameState {
  return { ...state, debug };
}

export function witchIsVisible(state: GameState): boolean {
  return state.debug || state.phase === 'won' || state.phase === 'lost';
}
