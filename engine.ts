import { chooseWitchMove } from './ai/jev.js';
import { copy } from './copy.js';
import {
  cellsAtManhattan,
  centerPos,
  directionOf,
  hunterCanReach,
  inBounds,
  manhattan,
  samePos,
  shiftCells,
  withoutCell,
} from './geo.js';
import {
  DEFAULT_CONFIG,
  DIR_BY_KEY,
  type ApplyMoveResult,
  type DirKey,
  type GameConfig,
  type GameState,
  type HistoryEntry,
  type Pos,
} from './types.js';

export function clampConfig(partial: Partial<GameConfig> = {}): GameConfig {
  const boardSize = Math.min(15, Math.max(3, Math.round(partial.boardSize ?? DEFAULT_CONFIG.boardSize)));
  const maxTurns = Math.min(99, Math.max(1, Math.round(partial.maxTurns ?? DEFAULT_CONFIG.maxTurns)));
  return {
    boardSize,
    maxTurns,
    witchStayInterval: DEFAULT_CONFIG.witchStayInterval,
  };
}

export function hunterMaxStep(state: GameState): number {
  return state.slowHunt ? 1 : 2;
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

export function witchMoves(from: Pos, size: number, mustStay: boolean): Pos[] {
  if (mustStay) {
    return [{ ...from }];
  }
  const out: Pos[] = [];
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

export function witchMustStay(turn: number, interval: number): boolean {
  return turn > 0 && turn % interval === 0;
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
    possibleWitch: state.possibleWitch.map((pos) => ({ ...pos })),
    scentCells: state.scentCells.map((pos) => ({ ...pos })),
    scentAge: state.scentAge,
    debug: state.debug,
    slowHunt: state.slowHunt,
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

function pulseDistance(state: GameState): void {
  const distance = manhattan(state.hunter, state.witch);
  state.lastManhattan = distance;
  state.manhattanRing = cellsAtManhattan(state.hunter, distance, state.config.boardSize);
  state.scentCells = state.manhattanRing.map((pos) => ({ ...pos }));
  state.scentAge = 0;
}

export function createGame(partial: Partial<GameConfig> = {}, debug = false, slowHunt = false): GameState {
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
    possibleWitch: [],
    scentCells: [],
    scentAge: 0,
    debug,
    slowHunt,
    pendingHunterFrom: null,
  };
  pulseDistance(state);
  state.possibleWitch = state.manhattanRing.map((pos) => ({ ...pos }));
  state.history.push(
    record(state, state.hunter, state.witch, state.witch, 'STAY', state.lastManhattan, 0),
  );
  return state;
}

export function applyHunterMove(state: GameState, to: Pos): ApplyMoveResult {
  if (state.phase !== 'hunter') {
    return { ok: false, reason: copy.engine.notHunterTurn, state };
  }
  if (
    !hunterCanReach(state.hunter, to, hunterMaxStep(state)) ||
    !inBounds(to, state.config.boardSize)
  ) {
    return { ok: false, reason: copy.engine.stepNotAllowed, state };
  }

  const next = cloneState(state);
  next.manhattanRing = [];
  next.pendingHunterFrom = { ...next.hunter };
  next.hunter = { ...to };
  next.possibleWitch = withoutCell(next.possibleWitch, next.hunter);

  if (samePos(next.hunter, next.witch)) {
    next.phase = 'won';
    next.pendingHunterFrom = null;
    return { ok: true, state: next };
  }

  next.phase = 'resolving';
  return { ok: true, state: next };
}

export async function resolveWitchTurn(state: GameState): Promise<ApplyMoveResult> {
  if (state.phase !== 'resolving') {
    return { ok: false, reason: copy.engine.witchNotMoving, state };
  }

  const next = cloneState(state);
  const hunterFrom = next.pendingHunterFrom ?? { ...next.hunter };
  const mustStay = witchMustStay(next.turn, next.config.witchStayInterval);
  const options = witchMoves(next.witch, next.config.boardSize, mustStay);
  const witchFrom = { ...next.witch };
  const maxStep = hunterMaxStep(next);
  const witchTo = await chooseWitchMove({
    boardSize: next.config.boardSize,
    maxTurns: next.config.maxTurns,
    turn: next.turn,
    witchStayInterval: next.config.witchStayInterval,
    hunter: next.hunter,
    witch: next.witch,
    hunterMaxStep: maxStep,
    mustStay,
    lastManhattan: next.lastManhattan,
    options,
    hunterReachableNextTurn: hunterMoves(next.hunter, next.config.boardSize, maxStep),
  });
  next.witch = { ...witchTo };

  const direction = directionOf(witchFrom, witchTo);
  const step = DIR_BY_KEY[direction];
  next.possibleWitch = withoutCell(
    shiftCells(next.possibleWitch, step.dx, step.dy),
    next.hunter,
  );
  if (mustStay) {
    pulseDistance(next);
    next.possibleWitch = withoutCell(
      next.manhattanRing.map((pos) => ({ ...pos })),
      next.hunter,
    );
  } else {
    next.scentAge += 1;
  }

  next.history.push(
    record(next, hunterFrom, witchFrom, witchTo, direction, mustStay ? next.lastManhattan : null),
  );
  next.pendingHunterFrom = null;

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
  };
}

export function setDebug(state: GameState, debug: boolean): GameState {
  return { ...state, debug };
}

export function setSlowHunt(state: GameState, slowHunt: boolean): GameState {
  return { ...state, slowHunt };
}

export function witchIsVisible(state: GameState): boolean {
  return state.debug || state.phase === 'won' || state.phase === 'lost';
}
