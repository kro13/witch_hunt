import { copy } from './copy.js';
import {
  applyHunterMove,
  createGame,
  HOUND_COUNT,
  hunterMoves,
  resolveWitchTurn,
  setDebug,
  useHounds,
  usePatrol,
  useRumours,
  useTrap,
  witchIsVisible,
} from './engine.js';
import { hunterCanReach, lineCells, samePos } from './geo.js';
import { type ApplyMoveResult, type DirKey, type GameState, type LineAxis, type Pos } from './types.js';

const HUNTER_SVG = `
<svg viewBox="0 0 32 40" aria-hidden="true">
  <path fill="#1c1610" d="M10 18h12l1 14H9z"/>
  <path fill="#c9a45c" d="M12 8h8l2 10H10z"/>
  <rect x="14" y="11" width="4" height="5" fill="#f3e2a8"/>
  <path fill="#8b6a2f" d="M11 8h10v2H11z"/>
  <path fill="#e8d9b8" d="M15 2h2v6h-2z"/>
</svg>`;

const WITCH_SVG = `
<svg viewBox="0 0 32 40" aria-hidden="true">
  <path fill="#1a1018" d="M16 2 L28 18 H4z"/>
  <path fill="#6e4d7a" d="M7 18 h18 l-3 18 h-12z"/>
  <circle cx="16" cy="20" r="3" fill="#e8d9b8"/>
</svg>`;

const HOUND_SVG = `
<svg viewBox="0 0 32 32" aria-hidden="true">
  <path fill="#5c3d22" d="M9 8 L15 2 L16 13 Z"/>
  <path fill="#8b6a2f" d="M10 12 L22 10 L24 16 L21 24 L10 22 Z"/>
  <path fill="#c9a45c" d="M22 14 L31 18 L22 21 Z"/>
  <circle cx="18" cy="15" r="1.5" fill="#1c1610"/>
  <circle cx="31" cy="18" r="1.4" fill="#1c1610"/>
</svg>`;

const TRAP_SVG = `
<svg viewBox="0 0 32 32" aria-hidden="true">
  <path fill="#2c2620" d="M2 16 L8 5 H14 L16 16 L14 27 H8 Z"/>
  <path fill="#2c2620" d="M30 16 L24 5 H18 L16 16 L18 27 H24 Z"/>
  <path fill="#c9a45c" d="M8 6 L10 2 L12 6"/>
  <path fill="#c9a45c" d="M20 6 L22 2 L24 6"/>
  <path fill="#c9a45c" d="M8 26 L10 30 L12 26"/>
  <path fill="#c9a45c" d="M20 26 L22 30 L24 26"/>
  <circle cx="16" cy="16" r="4.2" fill="#8b6a2f"/>
  <circle cx="16" cy="16" r="1.5" fill="#1c1610"/>
</svg>`;

const TOKEN_SVG = {
  hunter: HUNTER_SVG,
  witch: WITCH_SVG,
  hound: HOUND_SVG,
  trap: TRAP_SVG,
} as const;

const boardEl = document.querySelector<HTMLElement>('#board')!;
const ranksEl = document.querySelector<HTMLElement>('#ranks')!;
const filesEl = document.querySelector<HTMLElement>('#files')!;
const turnNowEl = document.querySelector('#turn-now')!;
const turnMaxEl = document.querySelector('#turn-max')!;
const stayLineEl = document.querySelector('#stay-line')!;
const pulseLineEl = document.querySelector('#pulse-line')!;
const journalEl = document.querySelector('#journal')!;
const compassCaption = document.querySelector('#compass-caption')!;
const compassNeedle = document.querySelector<SVGPolygonElement>('#compass-needle')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const overlayKicker = document.querySelector('#overlay-kicker')!;
const overlayTitle = document.querySelector('#overlay-title')!;
const overlayBody = document.querySelector('#overlay-body')!;
const boardSizeInput = document.querySelector<HTMLInputElement>('#board-size')!;
const maxTurnsInput = document.querySelector<HTMLInputElement>('#max-turns')!;
const debugToggle = document.querySelector<HTMLInputElement>('#debug-toggle')!;
const rumoursBtn = document.querySelector<HTMLButtonElement>('#action-rumours')!;
const patrolBtn = document.querySelector<HTMLButtonElement>('#action-patrol')!;
const houndsBtn = document.querySelector<HTMLButtonElement>('#action-hounds')!;
const trapBtn = document.querySelector<HTMLButtonElement>('#action-trap')!;
const hintEl = document.querySelector('#move-hint')!;

let state: GameState = createGame();
let busy = false;
let patrolMode = false;
let patrolAnchor: Pos | null = null;
let patrolHover: Pos | null = null;
let houndsMode = false;
let houndsPicks: Pos[] = [];
let trapMode = false;

function fileLabel(x: number): string {
  return String.fromCharCode(65 + x);
}

function buildBoard(size: number): void {
  boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  boardEl.replaceChildren();
  ranksEl.replaceChildren();
  filesEl.replaceChildren();
  ranksEl.style.gridTemplateRows = `repeat(${size}, 1fr)`;

  for (let y = 0; y < size; y += 1) {
    const rank = document.createElement('span');
    rank.textContent = String(y + 1);
    ranksEl.append(rank);
    for (let x = 0; x < size; x += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${fileLabel(x)}${y + 1}`);
      cell.addEventListener('click', () => {
        void onCellClick(x, y);
      });
      cell.addEventListener('mouseenter', () => {
        if (!patrolMode) {
          return;
        }
        patrolHover = { x, y };
        render();
      });
      boardEl.append(cell);
    }
  }

  for (let x = 0; x < size; x += 1) {
    const file = document.createElement('span');
    file.textContent = fileLabel(x);
    filesEl.append(file);
  }
}

function token(kind: keyof typeof TOKEN_SVG): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `token token-${kind}`;
  wrap.innerHTML = TOKEN_SVG[kind];
  return wrap;
}

function render(): void {
  const size = state.config.boardSize;
  if (boardEl.childElementCount !== size * size) {
    buildBoard(size);
  }

  const moves =
    state.phase === 'hunter' && !patrolMode && !houndsMode && !trapMode
      ? hunterMoves(state.hunter, size)
      : [];
  const showWitch = witchIsVisible(state);
  const preview = patrolPreviewCells();

  for (const cell of boardEl.querySelectorAll<HTMLButtonElement>('.cell')) {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const pos = { x, y };
    cell.className = 'cell';
    cell.setAttribute('aria-label', `${fileLabel(x)}${y + 1}`);
    if ((x + y) % 2 === 1) {
      cell.classList.add('is-alt');
    }
    cell.replaceChildren();

    const fog = document.createElement('span');
    fog.className = 'fog';
    cell.append(fog);

    if (moves.some((m) => samePos(m, pos))) {
      cell.classList.add('is-reachable');
    }

    const hunterHere = samePos(state.hunter, pos);
    const onPatrol = state.patrolCells.some((m) => samePos(m, pos));
    const onPreview = preview.some((m) => samePos(m, pos));
    if (onPatrol || onPreview) {
      cell.classList.add(onPatrol ? 'is-patrol' : 'is-patrol-preview');
      if (onPatrol && state.patrolHit) {
        cell.classList.add('is-patrol-hit');
      }
      if (patrolMode) {
        cell.classList.add('is-patrol-pick');
      }
      const mark = document.createElement('span');
      mark.className = 'patrol-mark';
      mark.setAttribute('aria-hidden', 'true');
      cell.append(mark);
    }

    if (houndsMode) {
      cell.classList.add('is-hound-pick');
    }
    if (state.hounds.some((m) => samePos(m, pos)) || houndsPicks.some((m) => samePos(m, pos))) {
      cell.append(token('hound'));
    }

    if (trapMode) {
      cell.classList.add('is-trap-pick');
    }
    if (state.trap && samePos(state.trap, pos)) {
      cell.append(token('trap'));
    }

    if (!hunterHere && state.manhattanRing.some((m) => samePos(m, pos))) {
      cell.classList.add('is-pulse');
      const mark = document.createElement('span');
      mark.className = 'pulse-mark';
      mark.setAttribute('aria-hidden', 'true');
      cell.append(mark);
      const label = cell.getAttribute('aria-label') ?? '';
      cell.setAttribute('aria-label', copy.cellPossibleWitch(label));
    }

    if (samePos(state.hunter, pos)) {
      cell.classList.add('is-hunter');
      cell.append(token('hunter'));
    }
    if (showWitch && samePos(state.witch, pos)) {
      cell.append(token('witch'));
    }
  }

  turnNowEl.textContent = String(state.turn);
  turnMaxEl.textContent = String(state.config.maxTurns);

  stayLineEl.textContent = copy.stayFree;

  if (state.lastManhattan === null) {
    pulseLineEl.textContent = copy.pulseUnknown;
  } else if (state.manhattanRing.length > 0) {
    pulseLineEl.textContent = copy.pulseFresh(state.lastManhattan);
  } else {
    pulseLineEl.textContent = copy.pulseLast(state.lastManhattan);
  }

  renderJournal();
  renderCompass();
  renderOverlay();
  renderActions();

  if (state.phase === 'resolving') {
    hintEl.textContent = copy.hintResolving;
  } else if (houndsMode) {
    hintEl.textContent = copy.hintHounds(houndsPicks.length);
  } else if (trapMode) {
    hintEl.textContent = copy.hintTrap;
  } else if (patrolMode && patrolAnchor) {
    hintEl.textContent = copy.hintPatrolLine;
  } else if (patrolMode) {
    hintEl.textContent = copy.hintPatrol;
  } else if (state.phase === 'hunter') {
    hintEl.textContent = copy.hintMove;
  }
}

function patrolPreviewCells(): Pos[] {
  if (!patrolMode || !patrolAnchor) {
    return [];
  }
  const size = state.config.boardSize;
  if (patrolHover && patrolHover.y === patrolAnchor.y) {
    return lineCells('row', patrolAnchor.y, size);
  }
  if (patrolHover && patrolHover.x === patrolAnchor.x) {
    return lineCells('col', patrolAnchor.x, size);
  }
  return [...lineCells('row', patrolAnchor.y, size), ...lineCells('col', patrolAnchor.x, size)];
}

function cancelPatrolMode(): void {
  patrolMode = false;
  patrolAnchor = null;
  patrolHover = null;
}

function cancelHoundsMode(): void {
  houndsMode = false;
  houndsPicks = [];
}

function cancelTrapMode(): void {
  trapMode = false;
}

function cancelPlacement(): void {
  cancelPatrolMode();
  cancelHoundsMode();
  cancelTrapMode();
}

function renderActions(): void {
  const hunterReady = !busy && state.phase === 'hunter';
  rumoursBtn.disabled = !hunterReady || !state.rumoursAvailable;
  rumoursBtn.textContent = copy.actionRumours;
  rumoursBtn.title = copy.actionRumoursTitle;
  patrolBtn.disabled = !hunterReady || !state.patrolAvailable;
  patrolBtn.textContent = copy.actionPatrol;
  patrolBtn.title = copy.actionPatrolTitle;
  patrolBtn.classList.toggle('is-armed', patrolMode);
  houndsBtn.disabled = !hunterReady || !state.houndsAvailable;
  houndsBtn.textContent = copy.actionHounds;
  houndsBtn.title = copy.actionHoundsTitle;
  houndsBtn.classList.toggle('is-armed', houndsMode);
  trapBtn.disabled = !hunterReady || !state.trapAvailable;
  trapBtn.textContent = copy.actionTrap;
  trapBtn.title = copy.actionTrapTitle;
  trapBtn.classList.toggle('is-armed', trapMode);
}

function renderJournal(): void {
  journalEl.replaceChildren();
  if (state.history.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'is-empty';
    empty.textContent = copy.journalEmpty;
    journalEl.append(empty);
    return;
  }
  for (const entry of [...state.history].reverse()) {
    const li = document.createElement('li');
    if (entry.action === 'patrolHit' || entry.action === 'trapCaught') {
      li.classList.add('is-hit');
    } else if (entry.action === 'rumours' || entry.direction === 'STAY') {
      li.classList.add('is-stay');
    }
    const watch = document.createElement('span');
    watch.className = 'watch';
    watch.textContent = copy.journalWatch(entry.turn);
    const body = document.createElement('span');
    if (entry.action === 'rumours') {
      body.textContent = copy.journalRumours(entry.manhattan ?? 0);
    } else if (entry.action === 'patrolHit') {
      body.textContent = copy.journalPatrolHit;
    } else if (entry.action === 'patrol') {
      body.textContent = copy.journalPatrol;
    } else if (entry.action === 'hounds') {
      body.textContent = copy.journalHounds;
    } else if (entry.action === 'trapCaught') {
      body.textContent = copy.journalTrapCaught;
    } else if (entry.action === 'trapBroke') {
      body.textContent = copy.journalTrapBroke;
    } else if (entry.action === 'trap') {
      body.textContent = copy.journalTrap;
    } else {
      const extra = entry.manhattan === null ? '' : copy.journalDistance(entry.manhattan);
      body.textContent = `${copy.direction[entry.direction]}${extra}`;
    }
    li.append(watch, body);
    journalEl.append(li);
  }
}

const NEEDLE_ROTATION: Record<DirKey, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
  STAY: 0,
};

function renderCompass(): void {
  const last = [...state.history].reverse().find((entry) => entry.action === null);
  const dir = last?.direction;
  compassNeedle.classList.toggle('is-none', !dir);
  compassNeedle.classList.toggle('is-stay', dir === 'STAY');
  compassNeedle.style.transform = `rotate(${dir ? NEEDLE_ROTATION[dir] : 0}deg)`;

  for (const text of document.querySelectorAll<SVGTextElement>('.compass-points text')) {
    text.classList.toggle('is-active', text.dataset.dir === dir);
  }

  if (!dir) {
    compassCaption.textContent = copy.compassNone;
  } else if (dir === 'STAY') {
    compassCaption.textContent = copy.compassStay;
  } else {
    compassCaption.textContent = copy.compassFled(copy.direction[dir]);
  }
}

function renderOverlay(): void {
  if (state.phase === 'won') {
    overlay.hidden = false;
    overlayKicker.textContent = copy.winKicker;
    overlayTitle.textContent = copy.winTitle;
    overlayBody.textContent = copy.winBody(state.turn, state.config.maxTurns);
    return;
  }
  if (state.phase === 'lost') {
    overlay.hidden = false;
    overlayKicker.textContent = copy.loseKicker;
    overlayTitle.textContent = copy.loseTitle;
    overlayBody.textContent = copy.loseBody(state.config.maxTurns);
    return;
  }
  overlay.hidden = true;
}

async function onCellClick(x: number, y: number): Promise<void> {
  if (busy || state.phase !== 'hunter') {
    return;
  }
  const to = { x, y };
  if (patrolMode) {
    onPatrolCell(to);
    return;
  }
  if (houndsMode) {
    onHoundCell(to);
    return;
  }
  if (trapMode) {
    void playHunterTurn(() => useTrap(state, to));
    return;
  }
  if (!hunterCanReach(state.hunter, to)) {
    return;
  }
  await playHunterTurn(() => applyHunterMove(state, to));
}

function onPatrolCell(pos: Pos): void {
  if (!patrolAnchor) {
    patrolAnchor = { ...pos };
    render();
    return;
  }
  if (samePos(patrolAnchor, pos)) {
    patrolAnchor = null;
    render();
    return;
  }
  let axis: LineAxis | null = null;
  let index = 0;
  if (patrolAnchor.y === pos.y) {
    axis = 'row';
    index = pos.y;
  } else if (patrolAnchor.x === pos.x) {
    axis = 'col';
    index = pos.x;
  }
  if (!axis) {
    patrolAnchor = { ...pos };
    render();
    return;
  }
  void playHunterTurn(() => usePatrol(state, axis, index));
}

function onHoundCell(pos: Pos): void {
  const existing = houndsPicks.findIndex((picked) => samePos(picked, pos));
  if (existing >= 0) {
    houndsPicks.splice(existing, 1);
    render();
    return;
  }
  houndsPicks.push({ ...pos });
  if (houndsPicks.length < HOUND_COUNT) {
    render();
    return;
  }
  const cells = houndsPicks.map((picked) => ({ ...picked }));
  void playHunterTurn(() => useHounds(state, cells));
}

async function playHunterTurn(apply: () => ApplyMoveResult): Promise<void> {
  if (busy) {
    return;
  }
  busy = true;
  cancelPlacement();
  const applied = apply();
  if (!applied.ok) {
    busy = false;
    render();
    return;
  }
  state = applied.state;
  render();

  if (state.phase !== 'resolving') {
    busy = false;
    render();
    return;
  }

  await wait(340);
  const resolved = await resolveWitchTurn(state);
  state = resolved.state;
  busy = false;
  render();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function restart(): void {
  cancelPlacement();
  const boardSize = Number(boardSizeInput.value);
  const maxTurns = Number(maxTurnsInput.value);
  state = createGame({ boardSize, maxTurns }, debugToggle.checked);
  boardSizeInput.value = String(state.config.boardSize);
  maxTurnsInput.value = String(state.config.maxTurns);
  busy = false;
  render();
}

debugToggle.addEventListener('change', () => {
  state = setDebug(state, debugToggle.checked);
  render();
});

rumoursBtn.addEventListener('click', () => {
  void playHunterTurn(() => useRumours(state));
});

houndsBtn.addEventListener('click', () => {
  if (busy || state.phase !== 'hunter' || !state.houndsAvailable) {
    return;
  }
  if (houndsMode) {
    cancelHoundsMode();
    render();
    return;
  }
  cancelPlacement();
  houndsMode = true;
  houndsPicks = [];
  render();
});

trapBtn.addEventListener('click', () => {
  if (busy || state.phase !== 'hunter' || !state.trapAvailable) {
    return;
  }
  if (trapMode) {
    cancelTrapMode();
    render();
    return;
  }
  cancelPlacement();
  trapMode = true;
  render();
});

patrolBtn.addEventListener('click', () => {
  if (busy || state.phase !== 'hunter' || !state.patrolAvailable) {
    return;
  }
  if (patrolMode) {
    cancelPatrolMode();
    render();
    return;
  }
  cancelPlacement();
  patrolMode = true;
  patrolAnchor = null;
  patrolHover = null;
  render();
});

document.querySelector('#restart')!.addEventListener('click', restart);
document.querySelector('#overlay-restart')!.addEventListener('click', restart);

const KEY_DELTA: Record<string, Pos> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (patrolMode || houndsMode || trapMode)) {
    event.preventDefault();
    cancelPlacement();
    render();
    return;
  }
  const delta = KEY_DELTA[event.key];
  if (!delta || busy || state.phase !== 'hunter' || patrolMode || houndsMode || trapMode) {
    return;
  }
  const step = event.shiftKey ? 2 : 1;
  event.preventDefault();
  void playHunterTurn(() =>
    applyHunterMove(state, {
      x: state.hunter.x + delta.x * step,
      y: state.hunter.y + delta.y * step,
    }),
  );
});

function text(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function applyShellCopy(): void {
  document.title = copy.documentTitle;
  text('eyebrow', copy.eyebrow);
  text('title', copy.title);
  text('lede', copy.lede);
  text('move-hint', copy.hintMove);
  text('panel-watch', copy.panelWatch);
  text('watch-prefix', copy.watchPrefix);
  text('watch-of', copy.watchOf);
  text('panel-bearing', copy.panelBearing);
  text('panel-journal', copy.panelJournal);
  text('panel-instruments', copy.panelInstruments);
  text('overlay-restart', copy.overlayRestart);
  text('label-board-size', copy.labelBoardSize);
  text('label-max-turns', copy.labelMaxTurns);
  text('label-debug', copy.labelDebug);
  text('action-rumours', copy.actionRumours);
  text('action-patrol', copy.actionPatrol);
  text('action-hounds', copy.actionHounds);
  text('action-trap', copy.actionTrap);
  text('restart', copy.newHunt);
  text('rules-title', copy.rulesTitle);
  text('pulse-line', copy.pulseUnknown);
  text('compass-caption', copy.compassNone);

  document.getElementById('stage')?.setAttribute('aria-label', copy.stageLabel);
  document.getElementById('board')?.setAttribute('aria-label', copy.boardLabel);
  document.getElementById('compass')?.setAttribute('aria-label', copy.compassLabel);

  const rulesList = document.getElementById('rules-list');
  if (rulesList) {
    rulesList.replaceChildren(
      ...copy.rules.map((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        return item;
      }),
    );
  }

  for (const point of document.querySelectorAll<SVGTextElement>('.compass-points text')) {
    const dir = point.dataset.dir as DirKey | undefined;
    if (dir && dir in copy.directionShort) {
      point.textContent = copy.directionShort[dir];
    }
  }
}

applyShellCopy();
buildBoard(state.config.boardSize);
render();
