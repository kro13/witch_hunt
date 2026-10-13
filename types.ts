export interface Pos {
  x: number;
  y: number;
}

export interface GameConfig {
  boardSize: number;
  maxTurns: number;
  witchStayInterval: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  boardSize: 5,
  maxTurns: 25,
  witchStayInterval: 5,
};

export type DirKey = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'STAY';

export interface Direction {
  key: DirKey;
  dx: number;
  dy: number;
}

export const DIRECTIONS: readonly Direction[] = [
  { key: 'N', dx: 0, dy: -1 },
  { key: 'NE', dx: 1, dy: -1 },
  { key: 'E', dx: 1, dy: 0 },
  { key: 'SE', dx: 1, dy: 1 },
  { key: 'S', dx: 0, dy: 1 },
  { key: 'SW', dx: -1, dy: 1 },
  { key: 'W', dx: -1, dy: 0 },
  { key: 'NW', dx: -1, dy: -1 },
  { key: 'STAY', dx: 0, dy: 0 },
];

export const DIR_BY_KEY: Record<DirKey, Direction> = Object.fromEntries(
  DIRECTIONS.map((d) => [d.key, d]),
) as Record<DirKey, Direction>;

export type Outcome = 'ongoing' | 'won' | 'lost';
export type Phase = 'hunter' | 'resolving' | 'won' | 'lost';

export interface HistoryEntry {
  turn: number;
  hunterFrom: Pos;
  hunterTo: Pos;
  witchFrom: Pos;
  witchTo: Pos;
  direction: DirKey;
  manhattan: number | null;
}

export interface GameState {
  config: GameConfig;
  hunter: Pos;
  witch: Pos;
  turn: number;
  phase: Phase;
  history: HistoryEntry[];
  lastManhattan: number | null;
  manhattanRing: Pos[];
  possibleWitch: Pos[];
  scentCells: Pos[];
  scentAge: number;
  debug: boolean;
  slowHunt: boolean;
  pendingHunterFrom: Pos | null;
}

export interface ApplyMoveResult {
  ok: boolean;
  reason?: string;
  state: GameState;
}
