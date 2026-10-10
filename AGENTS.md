# AGENTS.md

Guidance for AI coding agents working in this repo.

**`PLAN.md` is the living plan.** Read it before starting work. When you finish a task, tick its checklist item; when scope or a key decision changes, update the relevant section and add a dated line to the decisions log.

## Project
BJJ training journal: one-tap logging of sessions and rounds, plus descriptive views of progress. Static site on GitHub Pages; no backend. All data stays in the browser. Sibling of [tinylog](https://github.com/parmsam/tinylog), whose conventions it follows.

## Stack
- Vite + TypeScript (strict), **no UI framework**: plain DOM modules.
- Charts and the companion are hand-written SVG; motion is CSS.
- vite-plugin-pwa (`registerType: 'prompt'`, never auto-reload).

## Commands
- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` (Vitest, jsdom), `npm run test:e2e` (Playwright)
- `npm run check`: typecheck + unit + e2e; run before every commit

## Conventions
- **Event log is the source of truth.** Never store derived counters (mat hours, ratios, unlocked patches); compute them from events.
- **Time**: store epoch ms. Running sessions and rounds are events without `endAt`; derive elapsed from `Date.now()`. Never count with `setInterval`. A finished entry logged after the fact has `detail.min` and no `endAt` (see `spanEnd` in `core/events.ts`).
- **Days and weeks** go through `src/core/days.ts` (DST-safe). Unit tests run in `America/New_York`.
- **Storage**: only via `src/core/db.ts` (IndexedDB + localStorage mirror `matlog:v1:mirror`) and `src/core/settings.ts` (`matlog:v1:settings`). Wrap reads/writes in try/catch; bump the version and add a migration on schema changes. Deletes are soft (`deleted: true`).
- **State**: mutate via `src/core/log.ts`; UI modules subscribe.
- **Logging rules** live in `src/core/ops.ts`. Card taps, `?do=` links (`core/linkActions.ts`), pasted Markdown (`core/markdown.ts`) and `window.matlog` (`ui/agentApi.ts`) all go through it. When adding a link parameter or option, add it to `public/llms.txt` and the API help too.
- **Vocabulary**: positions, techniques and submissions live in `src/core/catalog.ts`. Unknown text is kept as free text, never rejected.
- **Stats are descriptive only.** Say what happened and what it's based on, hide below a minimum, and never phrase anything as advice, a score or a prediction. "You noted getting stuck in half guard most" is fine; "work on half guard" is not.
- **Nothing is lost**: no streaks or anything that can be broken. Rewards are cumulative.
- **Buddies** share one rig in `src/ui/companion.ts` (body, sleeves and hands, belt and knot, eyes, two mouths). A new character only adds colors, a head and optional `back` extras, so reactions, stripes and patches keep working. Never add a sad or disappointed state.
- **Focuses and problems** are the person's own words, stored as `focus` / `problem` events (`core/focus.ts`, `core/notebook.ts`). Quick fills come from their log; never suggest or auto-set a focus or problem (agents included). Prompts may be questions; never verdicts, scores or "you should".
- **Injuries** (`core/injuries.ts`) are a record only: no diagnoses, rest advice, return-to-training dates or treatment suggestions anywhere (UI, patterns, API, agents). Severity is the person's call.
- **Your own techniques** are `technique` events; `core/catalog.ts` sees them through `setCustomTechniques` (kept in step with the log in `main.ts`). Look techniques up through the catalog functions, never `TECHNIQUES` directly, unless you mean the built-in list.
- **Charts** need a text equivalent (a table or list) and `title`/`aria-label` on marks.
- **Motion**: respect `prefers-reduced-motion`. Never use pixel `transform-origin` on SVG; use `transform-box: fill-box`.
- **Icons** come from `scripts/icons.mjs` (one SVG mark → favicon.ico/PNG/SVG, apple-touch-icon, Android 192/512 and maskable). Edit the mark there and rerun it; don't hand-edit the PNGs.
- **Privacy**: no analytics, no network calls besides fonts. Demo data uses made-up partners.
- **Forms on phones**: inputs at 16px or more; pinch-zoom keeps working.
- New behavior needs tests; every bug fix needs a regression test.

## Versioning
Bump `version` in `package.json` (shown in the footer) for a group of updates: minor while on 0.x, patch for fixes. Name the commit `vX.Y.Z: <what's in it>` and add a dated line to the `PLAN.md` decisions log.

## Deployment
Push to `main` → GitHub Actions runs the tests, builds and publishes to GitHub Pages (`base: '/matlog/'`).
