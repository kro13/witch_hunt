import type { DirKey } from './types.js';

export const copy = {
  documentTitle: 'Witch Hunt',
  eyebrow: 'Parish watch · fogbound green',
  title: 'Witch Hunt',
  lede: 'You are the hunter. She moves in the mist. Step once or twice, north-south or east-west, and listen for the way she fled.',

  stageLabel: 'The green',
  boardLabel: 'Hunt field',
  compassLabel: 'Witch bearing',

  hintMove: 'Move, or spend an action. An action ends the watch.',
  hintResolving: 'The mist shifts…',
  hintPatrol: 'Patrol: click a cell, then another in the same row or column.',
  hintPatrolLine: 'Click a cell in that row or column to set the line. Escape cancels.',
  hintHounds: (placed: number) =>
    `Hounds: click three cells${placed ? ` (${placed} of 3)` : ''}. Escape cancels.`,
  hintTrap: 'Trap: click a cell. If she is on it, the trap breaks. Escape cancels.',

  actionRumours: 'Rumours',
  actionRumoursTitle: 'Learn her road-distance. Once per hunt. Ends your watch.',
  actionPatrol: 'Patrol',
  actionPatrolTitle: 'Mark a row or column. Once per hunt. Ends your watch.',
  actionHounds: 'Hounds',
  actionHoundsTitle: 'Place three hounds. They copy her step. Once per hunt. Ends your watch.',
  actionTrap: 'Trap',
  actionTrapTitle: 'Set a bear trap. It catches her if she steps on it. Once per hunt. Ends your watch.',

  panelWatch: 'The watch',
  panelBearing: 'Last bearing',
  panelJournal: 'Turn history',
  panelInstruments: 'Instruments',
  watchPrefix: 'Watch',
  watchOf: 'of',

  stayFree: 'She may slip one cell, any direction, or hold still.',
  pulseUnknown: 'Road-distance unknown.',
  pulseFresh: (distance: number) =>
    `Road-distance ${distance}. Possible cells marked until you step.`,
  pulseLast: (distance: number) => `Last road-distance: ${distance} (Manhattan).`,

  compassNone: 'No stirring yet.',
  compassStay: 'She held still.',
  compassFled: (bearing: string) => `She fled ${bearing}.`,

  journalEmpty: 'The page is still blank.',
  journalWatch: (turn: number) => `W${turn}`,
  journalDistance: (distance: number) => ` · road-distance ${distance}`,
  journalRumours: (distance: number) => `Rumours · road-distance ${distance}`,
  journalPatrol: 'Patrol',
  journalPatrolHit: 'Patrol struck',
  journalHounds: 'Hounds loosed',
  journalTrap: 'Trap',
  journalTrapBroke: 'Trap broke',
  journalTrapCaught: 'Trap sprung',

  cellPossibleWitch: (cell: string) => `${cell} possible witch`,

  overlayRestart: 'Begin another watch',
  winKicker: 'Caught',
  winTitle: 'Now burn!',
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
    'The witch may step 1 cell any way, including diagonal, or hold still. You cannot see her until you share a cell.',
    'After she acts, her bearing is logged here.',
    'Each watch you either move or spend one action.',
    'Once per hunt, Rumours reveals her Manhattan distance.',
    'Once per hunt, Patrol marks a row or column. If she is on it when you set it, or occupies a marked cell later, the crosses flare until your next action.',
    'Once per hunt, Hounds lets you mark three cells. They copy each of her steps and vanish off the edge.',
    'Once per hunt, Trap marks a cell. If she steps on it, she is caught. If you set it on her cell, it breaks and vanishes.',
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
    rumoursSpent: 'Those rumours are already spent.',
    patrolSpent: 'That patrol is already spent.',
    houndsSpent: 'The hounds are already spent.',
    houndsNeedThree: 'Place three distinct cells.',
    trapSpent: 'That trap is already spent.',
  },
};
