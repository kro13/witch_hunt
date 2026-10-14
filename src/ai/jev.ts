import { directionOf } from '../geo.js';
import type { Pos } from '../types.js';
import { chooseWitchMove as chooseHeuristicWitchMove } from './ai.js';
import { JEV_URL } from './jev-config.js';

export interface WitchTurnInput {
  model: 'jev_witch' | 'jev_hunter';
  boardSize: number;
  maxTurns: number;
  turn: number;
  hunter: Pos;
  witch: Pos;
  hunterMaxStep: number;
  canStay: boolean;
  lastManhattan: number | null;
  rumoursAvailable: boolean;
  patrolAvailable: boolean;
  patrolCells: Pos[];
  houndsAvailable: boolean;
  hounds: Pos[];
  trapAvailable: boolean;
  trap: Pos | null;
  options: Pos[];
  hunterReachableNextTurn: Pos[];
  observations?: Array<{ turn: number; direction: string; hunterFrom: Pos; hunterTo: Pos; action: string | null }>;
  hunterChoices?: Array<{ id: string; instruction: string }>;
  belief?: Pos[];
}

function jevUrl(): string {
  if (typeof window !== 'undefined') {
    const fromWindow = (window as Window & { JEV_URL?: string }).JEV_URL;
    if (fromWindow) {
      return fromWindow;
    }
  }
  return JEV_URL;
}

function fallbackMove(input: WitchTurnInput): Pos {
  return chooseHeuristicWitchMove(
    input.options,
    input.hunter,
    input.boardSize,
    input.hunterMaxStep,
    input.canStay ? input.witch : undefined,
    input.patrolCells,
    input.trap,
  );
}

async function askJev(input: WitchTurnInput): Promise<string> {
  const request = input.model === 'jev_hunter'
    ? (({ witch: _hiddenWitch, lastManhattan: _hiddenDistance, ...visible }) => visible)(input)
    : input;
  const response = await fetch(jevUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Jev server ${response.status}`);
  }
  const body: unknown = await response.json();
  const direction =
    body && typeof body === 'object' && 'direction' in body
      ? (body as { direction: unknown }).direction
      : undefined;
  if (typeof direction !== 'string' || direction.length === 0) {
    throw new Error('Jev server returned no direction');
  }
  return direction;
}

export async function chooseWitchMove(input: WitchTurnInput): Promise<Pos> {
  if (input.options.length === 0) {
    return { ...input.witch };
  }
  if (input.options.length === 1) {
    return { ...input.options[0] };
  }

  const allowed = new Set<string>(input.options.map((pos) => directionOf(input.witch, pos)));

  try {
    const picked = await askJev(input);
    if (!allowed.has(picked)) {
      console.warn('Jev picked an illegal witch direction; using heuristic', picked);
      return fallbackMove(input);
    }
    const dest = input.options.find((pos) => directionOf(input.witch, pos) === picked);
    return dest ? { ...dest } : fallbackMove(input);
  } catch (error) {
    console.warn('Jev witch move failed; using heuristic', error);
    return fallbackMove(input);
  }
}

export async function chooseHunterMove(input: WitchTurnInput): Promise<Pos> {
  if (input.options.length < 2) return { ...input.options[0] };
  const keyFor = (pos: Pos) => `${directionOf(input.hunter, pos)}${Math.abs(pos.x - input.hunter.x) + Math.abs(pos.y - input.hunter.y)}`;
  const allowed = new Set<string>(input.options.map(keyFor));
  try {
    const picked = await askJev({ ...input, model: 'jev_hunter' });
    if (allowed.has(picked)) {
      const dest = input.options.find((pos) => keyFor(pos) === picked);
      if (dest) return { ...dest };
    }
  } catch (error) {
    console.warn('Jev hunter move failed; using nearest legal move', error);
  }
  return { ...input.options[0] };
}

export async function chooseHunterDecision(input: WitchTurnInput): Promise<string> {
  try {
    return await askJev({ ...input, model: 'jev_hunter' });
  } catch (error) {
    console.warn('Jev hunter strategy failed; choosing a legal move', error);
    return `MOVE:${directionOf(input.hunter, input.options[0])}${Math.abs(input.options[0].x - input.hunter.x) + Math.abs(input.options[0].y - input.hunter.y)}`;
  }
}
