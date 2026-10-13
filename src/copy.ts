import type { DirKey } from './types.js';

export const copy = {
  documentTitle: 'Witch Hunt',
  eyebrow: 'Parish watch · fogbound green',
  title: 'Witch Hunt',
  lede: 'You are the hunter. She moves in the mist. Step once or twice, north-south or east-west, and listen for the way she fled.',

  stageLabel: 'The green',
  boardLabel: 'Hunt field',
  compassLabel: 'Witch bearing',

  hintMove: 'Click a marked cell, or use arrow keys (Shift for two steps).',
  hintMoveSlow: 'Slow hunt: click a marked cell, or use arrow keys (one step).',
  labelSlowHunt: 'Slow hunt',
  hintResolving: 'The mist shifts…',

  panelWatch: 'The watch',
  panelBearing: 'Last bearing',
  panelJournal: 'Turn history',
  panelInstruments: 'Instruments',
  watchPrefix: 'Watch',
  watchOf: 'of',

  stayBound: 'This watch she is bound to hold still.',
  stayFree: 'She may slip one cell, any direction.',
  pulseUnknown: 'Road-distance unknown.',
  pulseFresh: (distance: number) =>
    `Road-distance ${distance}. Possible cells marked until you step.`,
  pulseLast: (distance: number) => `Last road-distance: ${distance} (Manhattan).`,
  pulseTracking: 'Possible cells follow her last bearing.',
  pulseScent: (age: number, distance: number) =>
    `Witch scent of road-distance ${distance}. ${age} watches since reveal.`,
  scentTooltip: (age: number) => `${age} watches since last distance reveal`,
  labelTrack: 'Track the witch',
  labelScent: 'Witch scent',

  compassNone: 'No stirring yet.',
  compassStay: 'She held still.',
  compassFled: (bearing: string) => `She fled ${bearing}.`,

  journalEmpty: 'The page is still blank.',
  journalWatch: (turn: number) => `W${turn}`,
  journalDistance: (distance: number) => ` · road-distance ${distance}`,

  cellPossibleWitch: (cell: string) => `${cell} possible witch`,

  overlayRestart: 'Begin another watch',
  winKicker: 'Caught',
  winTitle: 'Now burn the witch!',
  winBody: (turn: number, maxTurns: number) =>
    `Watch ${turn} of ${maxTurns}. The hunter found her.`,
  loseKicker: 'Escaped',
  loseTitle: 'Into the mist.',
  loseBody: (maxTurns: number) => `The ${maxTurns} watches are spent. She is gone.`,

  labelBoardSize: 'Field size',
  labelMaxTurns: 'Watches',
  labelDebug: 'Debug: reveal the witch',
  newHunt: 'New hunt',

  rulesTitle: 'Laws of the hunt',
  rules: [
    'You start in the middle. Move 1 or 2 cells, orthogonally only.',
    'The witch steps 1 cell any way, including diagonal. You cannot see her until you share a cell.',
    'After she moves, her bearing is logged here.',
    'Every 5th watch she must hold still, and you learn her Manhattan distance.',
    'Catch her before the watches run out.',
  ],

  direction: {
    N: 'North',
    NE: 'Northeast',
    E: 'East',
    SE: 'Southeast',
    S: 'South',
    SW: 'Southwest',
    W: 'West',
    NW: 'Northwest',
    STAY: 'Held still',
  } satisfies Record<DirKey, string>,

  directionShort: {
    N: 'N',
    NE: 'NE',
    E: 'E',
    SE: 'SE',
    S: 'S',
    SW: 'SW',
    W: 'W',
    NW: 'NW',
    STAY: '●',
  } satisfies Record<DirKey, string>,

  engine: {
    notHunterTurn: 'Not the hunter’s turn.',
    stepNotAllowed: 'That step is not allowed.',
    witchNotMoving: 'Witch is not moving now.',
  },
};
