# Witch Hunt — architecture and game design

A hidden-movement hunt on a square grid. The player is the hunter; a local AI is the witch. The hunter never sees the witch until they occupy the same cell (unless debug reveal is on). Information comes from bearings, a periodic Manhattan pulse, and a turn journal.

## How to run

Use `npm run <name>` for every script. That form always works.

```bash
npm install          # download TypeScript and Vite into node_modules (once)
npm run start        # compile, then serve the game and open the browser
npm run stop         # stop the Vite server on port 5173
npm run watch        # recompile dist/ whenever a .ts file changes
npm run build        # compile src/ → dist/ once
```

`npm run start` compiles `src/` → `dist/` and serves `index.html` at [http://localhost:5173](http://localhost:5173).

`npm start` and `npm stop` are optional shortcuts. npm only allows that skip-`run` form for a few built-in names (`start`, `stop`, `test`, …). Custom names such as `watch` and `build` must be `npm run watch` / `npm run build`. `npm watch` is not a valid command.

| Command | Script | What it does |
| --- | --- | --- |
| `npm run build` | `tsc` | Compiles TypeScript in `src/` to JavaScript in `dist/` once, then exits. Run this after you change `.ts` files if nothing is watching. |
| `npm run watch` | `tsc --watch` | Same compile, but stays running and rebuilds `dist/` whenever a `.ts` file changes. Leave this open in a second terminal while you play. |
| `npm run start` | `tsc && vite --open` | Compiles once, then starts Vite’s static server and opens the game in the browser. Does not recompile on save by itself. Shortcut: `npm start`. |
| `npm run stop` | `kill $(lsof -t -iTCP:5173 …)` | Stops whatever is listening on port 5173 (the Vite server). Safe to run if nothing is listening. Shortcut: `npm stop`. You can also press Ctrl+C in the terminal that ran `start`. |

`start` does not keep TypeScript in watch mode. For live recompile, run `npm run watch` in another terminal, then `npm run start`.

Do not load `src/*.ts` in the browser. Ordinary servers send `.ts` as `video/mp2t`. The page loads `./dist/index.js`.

---

## Game design

### Premise

Fog over a parish green. The hunter carries a lantern and can only step along the cardinals. The witch slips one cell at a time, including diagonally, and is invisible. The hunter infers her path from the direction of each of her moves, and every fifth watch she is forced still and her road-distance is revealed.

### Roles

| Role | Controller | Sight |
| --- | --- | --- |
| Hunter | Player | Own position, legal steps, journal, last bearing, last Manhattan pulse (if any). Witch only on catch, game over, or debug. |
| Witch | AI | Full board, including the hunter. |

### Board

- Square grid, default **5×5**, adjustable **3–15**.
- Origin `(0, 0)` is the top-left cell. `x` increases east (files A, B, C…), `y` increases south (ranks 1, 2, 3…).
- Hunter starts at the geometric centre: `(floor(size / 2), floor(size / 2))`.
- Witch starts on a random cell whose Manhattan distance from the hunter is at least `max(2, floor(size / 2))`.

### Movement

**Hunter** — must move. Exactly **1 or 2 cells**, orthogonally only (N/S/E/W). No diagonals, no staying. Off-board steps are illegal. **Slow hunt** (Instruments) limits this to 1 cell; the witch AI accounts for that.

**Witch** — on a normal watch, exactly **1 cell** in any of the 8 directions (Chebyshev distance 1). She cannot stay except on a bound watch.

**Bound watch** — every **5th** watch (`turn % 5 === 0`: 5, 10, 15, …) she **must hold still**.

Settings: field size and watch limit apply on **New hunt**. The stay interval is fixed at 5.

### Information

After each witch action the hunter always learns the **bearing** of that action (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`, or held still). The journal stores the full history.

The hunter learns **Manhattan distance** (`|Δx| + |Δy|`) from their cell to the witch:

- at the start of the hunt, before the first step (journal: `W0 Held still · road-distance N`)
- again on every bound watch (5, 10, 15, …), logged the same way

That number is kept as “last road-distance” until the next pulse. While a pulse is fresh, every in-bounds cell at that distance is marked on the board (the Manhattan diamond). The marks clear as soon as the hunter takes their next step, unless a tracking aid is on:

- **Witch scent** (default on): the last-reveal diamond stays put and fades each watch. Hover shows watches since that reveal. A new pulse restores full color, new positions, and a zero counter.
- **Track the witch** (default off): the diamond is shifted by each reported bearing. Cells the hunter steps on (without a catch) are dropped. After every distance reveal the set is replaced by the new Manhattan diamond.

The witch always knows the hunter’s cell.

### Catching and clocks

A **watch** is one hunter step plus the witch’s reply (unless the hunter already caught her).

1. Hunter steps.
2. Same cell → hunter wins immediately; the witch does not act.
3. Otherwise the witch acts (move or stay).
4. Same cell → hunter wins (the AI avoids this when it has another option).
5. If that watch was the last (`turn >= maxTurns`, default **25**) → witch escapes.
6. Else `turn` increments and the hunter acts again.

Catch means occupying the same cell. There is no attack roll.

### Player controls

- Click a highlighted cell (gold ring, 1 or 2 steps).
- Arrow keys: 1 step. Shift+arrow: 2 steps (disabled in Slow hunt).
- Illegal clicks (diagonal, stay, off-board, not the hunter’s phase) are ignored.

### Debug

**Debug: reveal the witch** shows her token without changing rules or AI. It can be toggled mid-hunt. On win or loss she is revealed regardless.

### Why the rules have teeth

The hunter is faster on a straight line (2 orthogonal) but cannot cut a diagonal. The witch is slower but can sit off-axis, where the hunter cannot land in one step. Forced stays plus a Manhattan diamond (opening pulse, then every five watches) periodically collapse the hidden-location set. The journal of bearings is the main tracking tool; the pulse is a calibration.

---

## Architecture

The game is a static page plus compiled ES modules. Logic is pure and UI-agnostic. The DOM layer owns rendering, input, and a short delay so the hunter’s step is visible before the witch replies.

```
index.html          shell markup, compass SVG, settings
src/styles.css      layout and atmosphere
src/copy.ts         all player-facing strings
src/index.ts        UI controller (input → engine → render)
src/engine.ts       rules, turn machine, history
src/ai.ts           witch move scoring
src/geo.ts          grid helpers
src/types.ts        shared types and direction table
dist/*.js           tsc output (what the browser loads)
```

### Dependency graph

```
index.ts  →  engine.ts  →  ai.ts
    │            │           │
    ├─ copy.ts   ├─ copy.ts  │
    ├─ geo.ts    ├─ geo.ts   │
    └─ types.ts  └─ types.ts └─ geo.ts, types.ts
```

`engine` and `ai` both use `geo`; `ai` does not import `engine`, so there is no cycle. Player-facing copy lives in `src/copy.ts`. Relative imports use `.js` specifiers because the browser loads native ESM from `dist/`.

### State

`GameState` is a plain immutable snapshot. Mutations clone, then return a new object.

| Field | Role |
| --- | --- |
| `config` | `boardSize`, `maxTurns`, `witchStayInterval` |
| `hunter`, `witch` | Current cells |
| `turn` | 1-based watch being played |
| `phase` | `'hunter'` \| `'resolving'` \| `'won'` \| `'lost'` |
| `history` | One `HistoryEntry` per completed witch action |
| `lastManhattan` | Last pulse (set at hunt start and on each bound watch) |
| `manhattanRing` | Cells at the latest pulse distance; emptied on the hunter’s next step |
| `possibleWitch` | Tracked diamond: shifted by each bearing, dropped where the hunter steps, reset on every pulse |
| `scentCells` | Last-reveal diamond for Witch scent; not shifted |
| `scentAge` | Watches since the last pulse; reset to 0 on each reveal |
| `debug` | Reveal flag |
| `slowHunt` | Hunter max step is 1 |
| `pendingHunterFrom` | Origin of the in-flight hunter step, used when recording the journal |

Engine functions take state in and return `{ ok, reason?, state }`. The UI keeps a single `state` variable.

### Turn machine

```
         createGame()
              │
              ▼
         ┌─────────┐  legal hunter step   ┌────────────┐
         │ hunter  │ ───────────────────► │ resolving  │
         └─────────┘                      └────────────┘
              ▲                                  │
              │              witch acts          │
              │         (after ~340ms in UI)     │
              │                                  ▼
              │                    catch → won
              └── turn++ ─────── else if turns left
                                 else → lost

         hunter lands on witch  →  won (skip resolving)
```

`applyHunterMove` only moves the hunter. `resolveWitchTurn` runs the AI and writes history. Splitting them lets the UI paint the lantern’s new cell before the bearing updates.

### Witch AI

`chooseWitchMove(options, hunter, size)` scores each legal cell and picks the maximum (small random jitter for ties).

Scoring, roughly:

- Landing on the hunter: −10000
- Cell the hunter can reach next step: −600
- Manhattan and Chebyshev distance: positive
- Off-axis relative to the hunter (diagonal offset): bonus — the hunter cannot step there
- Safe onward mobility: bonus
- Distance from the map edge: small bonus (corners trap her)
- `Math.random() * 4`: noise

On a bound watch `options` is only her current cell, so the scorer is unused.

### UI

`index.html` is the document shell. `src/copy.ts` holds every player-facing string; `src/index.ts` writes that copy into the shell on boot, then builds the grid, highlights legal hunter cells, draws tokens, fills the journal (newest first), rotates the compass needle, and shows the end overlay.

Render is a full pass from `state`. Debug toggling calls `setDebug` and re-renders; size and watch limit are read only on restart.

### Build

| Tool | Job |
| --- | --- |
| TypeScript (`tsc`) | `src/` → `dist/` ES2020 modules + source maps |
| Vite | Dev static server for `index.html`, `src/styles.css`, `dist/*.js` |

`package.json` `"type": "module"`. There is no bundler step at run time: the browser resolves `./engine.js` next to `dist/index.js`.
