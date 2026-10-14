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

Fog over a parish green. The hunter carries a lantern and can only step along the cardinals. The witch slips one cell at a time, including diagonally, or holds still, and is invisible. The hunter infers her path from the direction of each of her moves.

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

**Hunter** — each watch, either **move** (exactly **1 or 2 cells**, orthogonally only) **or spend one action**. No diagonals, no staying in place as a move. Off-board steps are illegal. The witch AI accounts for that reach.

**Witch** — **1 cell** in any of the 8 directions (Chebyshev distance 1), or **hold still**. Staying is optional every watch.

Settings: field size and watch limit apply on **New hunt**.

### Information

After each witch action the hunter always learns the **bearing** of that action (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`, or held still). The journal stores the full history.

The hunter learns **Manhattan distance** (`|Δx| + |Δy|`) only by spending **Rumours** (once per hunt). Holding still does not reveal it. Until then road-distance is unknown. While a pulse is fresh, every in-bounds cell at that distance is marked on the board (the Manhattan diamond). The marks clear as soon as the hunter takes their next step.

**Patrol** (once per hunt) marks a full row or column with dark-red crosses. If the witch is already on that line when it is laid, or occupies a marked cell after she acts, the crosses turn bright red and the journal logs `Patrol struck`. They clear when the hunter takes their next move or action.

**Hounds** (once per hunt) lets the hunter place three dog-head markers on chosen cells. After each witch step they move the same direction; a hound that leaves the board disappears. If she holds still, they stay.

**Trap** (once per hunt) marks one cell with a bear trap. If she occupies that cell after she acts, she is caught. If the trap is set on her current cell, it breaks and vanishes instead of catching her.

The witch always knows the hunter’s cell.

### Catching and clocks

A **watch** is one hunter step plus the witch’s reply (unless the hunter already caught her).

1. Hunter steps **or** spends an action (Rumours, Patrol, Hounds, or Trap).
2. If they moved onto the witch → hunter wins immediately; the witch does not act.
3. Otherwise the witch acts (move or stay).
4. Same cell, or a live trap under her after she acts → hunter wins (the AI avoids both when it has another option).
5. If that watch was the last (`turn >= maxTurns`, default **25**) → witch escapes.
6. Else `turn` increments and the hunter acts again.

Catch means occupying the same cell, or the witch occupying a live trap after she acts. There is no attack roll.

### Player controls

- Click a highlighted cell (gold ring, 1 or 2 steps).
- Arrow keys: 1 step. Shift+arrow: 2 steps.
- **Rumours**: once per hunt, reveals Manhattan distance, ends the watch.
- **Patrol**: once per hunt, click two cells in the same row or column to mark that line, ends the watch. Escape cancels placement.
- **Hounds**: once per hunt, click three cells to place them; they copy her step and fall off the edge, ends the watch. Escape cancels placement.
- **Trap**: once per hunt, click a cell to set a bear trap; it catches her if she steps on it, and breaks if set on her cell. Ends the watch. Escape cancels placement.
- Illegal clicks (diagonal, stay, off-board, not the hunter’s phase) are ignored.

### Debug

**Debug: reveal the witch** shows her token without changing rules or AI. It can be toggled mid-hunt. On win or loss she is revealed regardless.

### Why the rules have teeth

The hunter is faster on a straight line (2 orthogonal) but cannot cut a diagonal. The witch is slower but can sit off-axis, where the hunter cannot land in one step, and may hold still to avoid stepping onto a cell the hunter can reach next. The journal of bearings is the main tracking tool; Rumours is the distance calibration; Patrol is a tripwire on a rank or file; Hounds copy her last step across the green; Trap is a single cell that ends the hunt if she walks onto it.

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
| `config` | `boardSize`, `maxTurns` |
| `hunter`, `witch` | Current cells |
| `turn` | 1-based watch being played |
| `phase` | `'hunter'` \| `'resolving'` \| `'won'` \| `'lost'` |
| `history` | Witch actions and hunter actions (Rumours) |
| `lastManhattan` | Last pulse (set when Rumours is spent) |
| `manhattanRing` | Cells at the latest pulse distance; emptied on the hunter’s next step |
| `rumoursAvailable` | Hunter can still spend Rumours |
| `patrolAvailable` | Hunter can still spend Patrol |
| `patrolCells` | Marked row or column; empty if none |
| `patrolHit` | Witch occupied a marked cell; marks flare until the hunter’s next action |
| `houndsAvailable` | Hunter can still spend Hounds |
| `hounds` | Dog-head markers; shift with the witch, drop off-board |
| `trapAvailable` | Hunter can still spend Trap |
| `trap` | Bear-trap cell, or `null` if unset or broken |
| `debug` | Reveal flag |
| `pendingHunterFrom` | Origin of the in-flight hunter step, used when recording the journal |

Engine functions take state in and return `{ ok, reason?, state }`. The UI keeps a single `state` variable.

### Turn machine

```
         createGame()
              │
              ▼
         ┌─────────┐  move or action      ┌────────────┐
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

`applyHunterMove` only moves the hunter. `useRumours`, `usePatrol`, `useHounds`, and `useTrap` spend those actions and also enter `resolving`. `resolveWitchTurn` runs the AI, shifts hounds with the witch’s bearing, springs a live trap if she occupies it, and writes history. Splitting them lets the UI paint the hunter’s action before the bearing updates.

### Witch AI

`chooseWitchMove(options, hunter, size, maxStep, from)` scores each legal step and picks the maximum (small random jitter for ties). STAY is included in `options`. The Jev payload sets `canStay: true`, `rumoursAvailable`, `patrolAvailable`, `patrolCells`, `houndsAvailable`, `hounds`, `trapAvailable`, and `trap`. If the best step would land on a cell the hunter can reach next turn (or on the hunter, or on the trap), the fallback AI stays instead. Landing on a patrol line is penalized. Landing on the trap is treated as an instant loss.

Scoring, roughly:

- Landing on the hunter or the trap: −10000
- Cell the hunter can reach next step: −600
- Manhattan and Chebyshev distance: positive
- Off-axis relative to the hunter (diagonal offset): bonus — the hunter cannot step there
- Safe onward mobility: bonus
- Distance from the map edge: small bonus (corners trap her)
- `Math.random() * 4`: noise

### UI

`index.html` is the document shell. `src/copy.ts` holds every player-facing string; `src/index.ts` writes that copy into the shell on boot, then builds the grid, highlights legal hunter cells, draws tokens, fills the journal (newest first), rotates the compass needle, and shows the end overlay.

Render is a full pass from `state`. Debug toggling calls `setDebug` and re-renders; size and watch limit are read only on restart.

### Build

| Tool | Job |
| --- | --- |
| TypeScript (`tsc`) | `src/` → `dist/` ES2020 modules + source maps |
| Vite | Dev static server for `index.html`, `src/styles.css`, `dist/*.js` |

`package.json` `"type": "module"`. There is no bundler step at run time: the browser resolves `./engine.js` next to `dist/index.js`.
