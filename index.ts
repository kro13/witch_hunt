import { copy } from './copy.js';
import {
  applyHunterMove,
  createGame,
  hunterMaxStep,
  hunterMoves,
  resolveWitchTurn,
  setDebug,
  setSlowHunt,
  witchIsVisible,
  witchMustStay,
} from './engine.js';
import { hunterCanReach, samePos } from './geo.js';
import { type DirKey, type GameState, type Pos } from './types.js';

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
const trackToggle = document.querySelector<HTMLInputElement>('#track-toggle')!;
const scentToggle = document.querySelector<HTMLInputElement>('#scent-toggle')!;
const slowToggle = document.querySelector<HTMLInputElement>('#slow-toggle')!;
const hintEl = document.querySelector('#move-hint')!;

let state: GameState = createGame();
let busy = false;

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
      boardEl.append(cell);
    }
  }

  for (let x = 0; x < size; x += 1) {
    const file = document.createElement('span');
    file.textContent = fileLabel(x);
    filesEl.append(file);
  }
}

function token(kind: 'hunter' | 'witch'): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `token token-${kind}`;
  wrap.innerHTML = kind === 'hunter' ? HUNTER_SVG : WITCH_SVG;
  return wrap;
}

function render(): void {
  const size = state.config.boardSize;
  if (boardEl.childElementCount !== size * size) {
    buildBoard(size);
  }

  const moves = state.phase === 'hunter' ? hunterMoves(state.hunter, size, hunterMaxStep(state)) : [];
  const showWitch = witchIsVisible(state);

  for (const cell of boardEl.querySelectorAll<HTMLButtonElement>('.cell')) {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const pos = { x, y };
    cell.className = 'cell';
    cell.removeAttribute('title');
    cell.style.removeProperty('--scent-fade');
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
    const inTrack =
      !hunterHere && trackToggle.checked && state.possibleWitch.some((m) => samePos(m, pos));
    const inScent =
      !hunterHere && scentToggle.checked && state.scentCells.some((m) => samePos(m, pos));
    const inPulse =
      !hunterHere &&
      !trackToggle.checked &&
      !scentToggle.checked &&
      state.manhattanRing.some((m) => samePos(m, pos));
    if (inTrack || inScent || inPulse) {
      if (inTrack || inPulse) {
        cell.classList.add('is-pulse');
      }
      if (inScent) {
        const fade = Math.max(0.2, 1 - state.scentAge / state.config.witchStayInterval);
        cell.classList.add('is-scent');
        cell.style.setProperty('--scent-fade', String(fade));
        const tip = copy.scentTooltip(state.scentAge);
        cell.title = tip;
        cell.setAttribute('aria-label', copy.cellPossibleWitch(`${fileLabel(x)}${y + 1}. ${tip}`));
      }
      const mark = document.createElement('span');
      mark.className = 'pulse-mark';
      mark.setAttribute('aria-hidden', 'true');
      cell.append(mark);
      if (!inScent) {
        const label = cell.getAttribute('aria-label') ?? '';
        cell.setAttribute('aria-label', copy.cellPossibleWitch(label));
      }
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

  const bound = state.phase !== 'won' && state.phase !== 'lost' && witchMustStay(state.turn, state.config.witchStayInterval);
  stayLineEl.textContent = bound ? copy.stayBound : copy.stayFree;
  stayLineEl.classList.toggle('is-bound', bound);

  if (state.lastManhattan === null) {
    pulseLineEl.textContent = copy.pulseUnknown;
  } else if (state.manhattanRing.length > 0) {
    pulseLineEl.textContent = copy.pulseFresh(state.lastManhattan);
  } else if (trackToggle.checked && state.possibleWitch.length > 0) {
    pulseLineEl.textContent = copy.pulseTracking;
  } else if (scentToggle.checked && state.scentCells.length > 0) {
    pulseLineEl.textContent = copy.pulseScent(state.scentAge, state.lastManhattan);
  } else {
    pulseLineEl.textContent = copy.pulseLast(state.lastManhattan);
  }

  renderJournal();
  renderCompass();
  renderOverlay();

  if (state.phase === 'resolving') {
    hintEl.textContent = copy.hintResolving;
  } else if (state.phase === 'hunter') {
    hintEl.textContent = state.slowHunt ? copy.hintMoveSlow : copy.hintMove;
  }
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
    if (entry.direction === 'STAY') {
      li.classList.add('is-stay');
    }
    const extra = entry.manhattan === null ? '' : copy.journalDistance(entry.manhattan);
    const watch = document.createElement('span');
    watch.className = 'watch';
    watch.textContent = copy.journalWatch(entry.turn);
    const body = document.createElement('span');
    body.textContent = `${copy.direction[entry.direction]}${extra}`;
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
  const last = state.history[state.history.length - 1];
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
  if (!hunterCanReach(state.hunter, to, hunterMaxStep(state))) {
    return;
  }
  await playMove(to);
}

async function playMove(to: Pos): Promise<void> {
  busy = true;
  const moved = applyHunterMove(state, to);
  if (!moved.ok) {
    busy = false;
    return;
  }
  state = moved.state;
  render();

  if (state.phase !== 'resolving') {
    busy = false;
    return;
  }

  await wait(340);
  const resolved = await resolveWitchTurn(state);
  state = resolved.state;
  render();
  busy = false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function restart(): void {
  const boardSize = Number(boardSizeInput.value);
  const maxTurns = Number(maxTurnsInput.value);
  state = createGame({ boardSize, maxTurns }, debugToggle.checked, slowToggle.checked);
  boardSizeInput.value = String(state.config.boardSize);
  maxTurnsInput.value = String(state.config.maxTurns);
  busy = false;
  render();
}

debugToggle.addEventListener('change', () => {
  state = setDebug(state, debugToggle.checked);
  render();
});

slowToggle.addEventListener('change', () => {
  state = setSlowHunt(state, slowToggle.checked);
  render();
});

trackToggle.addEventListener('change', () => {
  render();
});

scentToggle.addEventListener('change', () => {
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
  const delta = KEY_DELTA[event.key];
  if (!delta || busy || state.phase !== 'hunter') {
    return;
  }
  const step = state.slowHunt || !event.shiftKey ? 1 : 2;
  event.preventDefault();
  void playMove({
    x: state.hunter.x + delta.x * step,
    y: state.hunter.y + delta.y * step,
  });
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
  text('label-slow', copy.labelSlowHunt);
  text('label-track', copy.labelTrack);
  text('label-scent', copy.labelScent);
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
