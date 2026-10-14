import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import { chebyshev, directionOf, hunterCanReach, manhattan, samePos } from '../geo.js';
import type { DirKey, Pos } from '../types.js';
import type { WitchTurnInput } from './jev.js';

const PORT = Number(process.env.JEV_PORT) || 8787;
const CORS_ORIGIN = process.env.JEV_CORS_ORIGIN || '*';

const GAME_RULES = {
  objective:
    'The hunter wins by occupying the same cell as the witch, or if the witch occupies a live trap after she acts. The witch wins by still being on a different cell after the last watch, off any live trap.',
  hunterMovement:
    'Each watch the hunter either moves 1 or 2 cells orthogonally (north/south/east/west) or spends one action. No diagonals and no staying in place as a move. hunterMaxStep is 2.',
  hunterActions:
    'Rumours (once per hunt) reveals Manhattan distance and marks that diamond until the hunter next steps. Patrol (once per hunt) marks a full row or column; if the witch occupies a marked cell after she acts, those marks flare. Hounds (once per hunt) lets the hunter place three markers on chosen cells; after each witch step they move the same direction and vanish if they leave the board. Trap (once per hunt) lets the hunter mark one cell; if the witch steps on it after she acts she is caught. If the trap is set on her current cell it breaks and vanishes instead of catching her. Any action ends the hunter’s watch immediately. rumoursAvailable, patrolAvailable, houndsAvailable, and trapAvailable are true until spent.',
  witchMovement:
    'Each watch the witch may move exactly 1 cell in one of the 8 directions, including diagonal, or hold still (STAY). Staying is optional every watch when canStay is true.',
  staying:
    'STAY is safe only if the hunter cannot reach her current cell on their next turn. Prefer STAY only in that case, and only when every useful step would land on the hunter, on the trap, or on a cell the hunter can reach next turn. If the current cell is hunter-reachable and any option is not, do not stay.',
  coordinates:
    'The board is a square grid. Origin (0, 0) is the top-left cell. x increases east. y increases south. Cells are named like chess files: A1 is (0, 0).',
  information:
    'After the witch acts, the hunter always learns the bearing of that action. Holding still does not reveal Manhattan distance. The hunter does not see the witch unless they share a cell. The witch knows the hunter’s cell.',
};

const DIR_LABEL: Record<DirKey, string> = {
  N: 'north (−y)',
  NE: 'northeast (+x, −y)',
  E: 'east (+x)',
  SE: 'southeast (+x, +y)',
  S: 'south (+y)',
  SW: 'southwest (−x, +y)',
  W: 'west (−x)',
  NW: 'northwest (−x, −y)',
  STAY: 'hold still (no cell change)',
};

const CORS = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let client: TypeSafeClient | null | undefined;

function loadDotEnv(): void {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // no .env in cwd
  }
}

function getClient(): TypeSafeClient {
  if (!client) {
    client = new TypeSafeClient();
  }
  return client;
}

function cellName(pos: Pos): string {
  return `${String.fromCharCode(65 + pos.x)}${pos.y + 1}`;
}

function describePos(pos: Pos): { x: number; y: number; cell: string } {
  return { x: pos.x, y: pos.y, cell: cellName(pos) };
}

function moveCriteria(input: WitchTurnInput): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const dest of input.options) {
    const direction = directionOf(input.witch, dest);
    const landsOnHunter = samePos(dest, input.hunter);
    const landsOnTrap = input.trap !== null && samePos(dest, input.trap);
    const hunterCanReachNextTurn = hunterCanReach(input.hunter, dest, input.hunterMaxStep);
    const parts = [
      direction === 'STAY'
        ? `Hold still on ${cellName(dest)} (${dest.x}, ${dest.y}). The hunter learns only that she held still.`
        : `Move ${DIR_LABEL[direction]} to ${cellName(dest)} (${dest.x}, ${dest.y}).`,
      `Manhattan to hunter: ${manhattan(dest, input.hunter)}.`,
      `Chebyshev to hunter: ${chebyshev(dest, input.hunter)}.`,
      landsOnHunter
        ? 'This lands on the hunter and loses immediately.'
        : landsOnTrap
          ? 'This lands on the trap and loses immediately.'
          : hunterCanReachNextTurn
            ? 'The hunter can reach this cell on their next turn.'
            : 'The hunter cannot reach this cell on their next turn.',
    ];
    criteria[direction] = parts.join(' ');
  }
  return criteria;
}

function witchDirectionQuestion(input: WitchTurnInput): string {
  const rumoursPitch = input.rumoursAvailable
    ? ' If `current.rumoursAvailable` is true the hunter can still spend Rumours later to learn Manhattan distance; STAY does not reveal it.'
    : '';
  return (
    'Which direction from `possibleMoves` should the witch take this turn to best evade the hunter? The witch wins if she is still off the hunter’s cell after watch `current.maxTurns`. Never pick a move with `landsOnHunter` or `landsOnTrap` true if any other option exists. Never pick a move (including STAY) with `hunterCanReachNextTurn` true if any option has `hunterCanReachNextTurn` false. When `current.canStay` is true she may pick STAY only if that STAY option has `hunterCanReachNextTurn` false and every other useful option has `hunterCanReachNextTurn` true, `landsOnHunter` true, or `landsOnTrap` true. Prefer destinations the hunter cannot reach next turn, off the hunter’s orthogonal lines, with more distance and room to keep moving. Avoid `current.patrolCells` and `current.trap` when another option exists. `current.hounds` copy this step and fall off the board; they do not catch her.' +
    rumoursPitch
  );
}

async function askJev(input: WitchTurnInput): Promise<string> {
  const criteria = moveCriteria(input);
  const possibleMoves = input.options.map((dest) => {
    const direction = directionOf(input.witch, dest);
    return {
      direction,
      destination: describePos(dest),
      isStay: direction === 'STAY',
      manhattanToHunter: manhattan(dest, input.hunter),
      chebyshevToHunter: chebyshev(dest, input.hunter),
      hunterCanReachNextTurn: hunterCanReach(input.hunter, dest, input.hunterMaxStep),
      landsOnHunter: samePos(dest, input.hunter),
      landsOnTrap: input.trap !== null && samePos(dest, input.trap),
    };
  });

  const response = await getClient().systemOne({
    state: {
      rules: GAME_RULES,
      current: {
        boardSize: input.boardSize,
        turn: input.turn,
        maxTurns: input.maxTurns,
        canStay: input.canStay,
        rumoursAvailable: input.rumoursAvailable,
        patrolAvailable: input.patrolAvailable,
        patrolCells: input.patrolCells.map(describePos),
        houndsAvailable: input.houndsAvailable,
        hounds: input.hounds.map(describePos),
        trapAvailable: input.trapAvailable,
        trap: input.trap ? describePos(input.trap) : null,
        hunterMaxStep: input.hunterMaxStep,
        hunter: describePos(input.hunter),
        witch: describePos(input.witch),
        manhattanNow: manhattan(input.hunter, input.witch),
        lastManhattanPulse: input.lastManhattan,
        hunterReachableNextTurn: input.hunterReachableNextTurn.map(describePos),
        lastWatchOfHunt: input.turn >= input.maxTurns,
      },
      possibleMoves,
    },
    questions: {
      direction: choice(witchDirectionQuestion(input), criteria),
    },
  });

  return response.answers.direction.choice;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function isPos(value: unknown): value is Pos {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const pos = value as Pos;
  return Number.isFinite(pos.x) && Number.isFinite(pos.y);
}

function isWitchTurnInput(value: unknown): value is WitchTurnInput {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const input = value as WitchTurnInput;
  return isPos(input.hunter) && isPos(input.witch) && Array.isArray(input.options);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const path = url.split('?')[0];
  const isJevPath = path === '/' || path === '/jev';

  if (req.method === 'OPTIONS' && isJevPath) {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === 'GET' && isJevPath) {
    send(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST' || !isJevPath) {
    send(res, 404, { error: 'Not found' });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    send(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (!isWitchTurnInput(parsed) || parsed.options.length === 0) {
    send(res, 400, { error: 'Invalid witch turn' });
    return;
  }

  if (parsed.options.length === 1) {
    send(res, 200, { direction: directionOf(parsed.witch, parsed.options[0]) });
    return;
  }

  try {
    send(res, 200, { direction: await askJev(parsed) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Jev request failed';
    send(res, 502, { error: message });
  }
}

loadDotEnv();

createServer((req, res) => {
  void handle(req, res).catch(() => {
    send(res, 500, { error: 'Server error' });
  });
}).listen(PORT, () => {
  console.log(`Jev server http://127.0.0.1:${PORT}/jev`);
});
