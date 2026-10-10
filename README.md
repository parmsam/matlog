# 🥋 matlog

A BJJ training journal that keeps everything on your phone. One tap starts a class, open mat, drilling session, comp or round, and you get clear ways to see your progress: mat hours, a week-by-week heatmap, subs for and against, where you get stuck, your techniques as a position graph, and your belt and stripe timeline.

**[Open the app →](https://parmsam.github.io/matlog/)** It's free, with no account and no ads, and it works offline.

<p align="center">
  <img src="docs/screenshot-desktop.png" alt="matlog on desktop in the no-gi theme: a companion in a blue belt, mat hours, a 'working on' line, five one-tap cards with class and a round running, and recent sessions with their rounds" width="64%" />
  &nbsp;
  <img src="docs/screenshot-mobile.png" alt="matlog on a phone in the gi theme: the companion, rank, cards and recent sessions" width="26%" />
</p>

matlog is a sibling of [tinylog](https://github.com/parmsam/tinylog) and uses the same template: one tap to log, easy to log late, patterns but never advice, and your data stays on your device. It's a static site on GitHub Pages; your log lives in your browser's IndexedDB, with a second copy in localStorage.

## Features

**Logging**
- **One tap.** Class, Open mat, Drilling, Comp and Round. Tap to start, tap to stop. Timers are timestamps, so they keep going through reloads, a locked phone or a closed tab. Starting open mat while class runs switches it instead of starting a second session.
- **Logging late is normal.** Every log shows **Undo**, **−5m / −15m / −30m** and **Details**. Hold a card to log one you already did, with its length.
- **Round log.** Stopping a round asks who you rolled with (partner, belt, size), subs you hit, what you tapped to and where you got stuck. Every field is optional and one tap away. Rounds belong to the session they happened in.
- **Working on.** One line on the home screen for what you want to try next class. You write it; matlog never suggests one.
- **Paste a class note.** Paste Markdown or plain text from your notes app and it becomes a session with its rounds. You see a preview before anything is saved.

**Technique library**
- Tag techniques per session from a built-in list of about 60 (takedowns, sweeps, passes, escapes, submissions), or type your own.
- **Last drilled**: every technique you've tagged, how many sessions, and how long ago.
- **Position graph**: standing → guard → passing → mount/back → submission, drawn only from techniques you've logged. Thicker lines mean more sessions, and a dashed outline marks positions you've noted getting stuck in.

<p align="center">
  <img src="docs/screenshot-techniques.png" alt="Technique library: a last-drilled table and a position graph with lines from closed guard to mount, half guard to side control and back to submission" width="64%" />
</p>

**Seeing progress**
- Mat hours (all time and this year), sessions and rounds.
- A **week-by-week heatmap** of mat time over 26 weeks, with a table version.
- **Subs for and against**: the ratio, your most-finished subs, what you tap to most, and a breakdown by partner belt.
- **Where you got stuck**, ranked.
- **Belt and stripe timeline**, with the mat hours between each promotion.
- **Patterns, never advice.** "You noted getting stuck in half guard most: 14 rolls." Each pattern says what it's based on and stays hidden until there's enough data. matlog won't tell you what to drill.

<p align="center">
  <img src="docs/screenshot-progress.png" alt="Progress: tiles for mat hours, sessions and rounds, the last 7 days, a 26-week heatmap and subs for and against" width="64%" />
</p>

**Delight**
- **A training buddy** who wears your belt and stripes, ties its belt when a session starts, taps out when you log a tap and cheers a finish.
- **Gi and no-gi themes.** The gi theme is light, with a woven texture; no-gi is dark. Auto follows your system setting.
- **Patches** for 10, 25, 50, 100, 250, 500 and 1,000 mat hours, sewn onto your buddy's gi. There are no streaks, so nothing can be lost.

<p align="center">
  <img src="docs/screenshot-round.png" alt="The round sheet on a phone: partner, belt, size, result, subs hit with quick picks" width="26%" />
</p>

## How it compares

Checked on 2026-10-09 against each app's own site and App Store listing. Prices are US prices and change often. "—" means the site didn't say.

| App | Cost | Runs on | Account | Where your log lives | Coaching or advice | Source |
|---|---|---|---|---|---|---|
| **matlog** | Free | Any phone or computer (web app, installable) | No | On your device only | None: describes what you logged | Open ([MIT](LICENSE)) |
| [BJJ Notes](https://www.bjjnotes.app) | Free; Pro $7.90/mo, $59.90/yr or $149 lifetime | iOS, Android | Yes | Their cloud (syncs devices) | AI insights, focus goals | Closed |
| [BJJBuddy](https://bjjbuddy.com/free-training-log-app/) | Free; $5.99/mo or $39.99/yr | iOS, Android | — | — | Video picks "based on your stats" | Closed |
| [BetterBJJ](https://betterbjj.com) | — | iOS, Android | — | — | AI game plans, proficiency scores | Closed |
| [MatTime](https://mattime.app) | $9.99 lifetime | iOS (Android planned) | Yes (public profiles) | — | Streaks, weekly goals, gym leaderboards | Closed |
| [Grapl](https://apps.apple.com/ph/app/grapl-app/id6761396034) | Free (10 roll logs); Pro subscription | iOS | — | — | AI coaching | Closed |
| [GrappleKit](https://grapplekit.com/) | Free; Premium $6.99/mo | — | — | — | Round timer, playlists | Closed |
| Notes app or paper | Free | Anywhere | No | Wherever you keep it | None | — |

**Where matlog fits:** it's for someone who wants a fast, good-looking journal with real stats, without a sign-up, a subscription or a coach in the app.
- **Want an AI to tell you what to work on, or a voice-first log?** BJJ Notes and BetterBJJ do that, through their cloud and paid plans.
- **Want leaderboards with your gym?** MatTime does that.
- **Already keep notes in Notes, Obsidian or paper?** Keep them. matlog reads a pasted class note and exports Markdown, so the two work together.
- We looked for "Grapple Log" and found no app by that name.

## Install it on your phone

| Phone | How |
|---|---|
| **iPhone / iPad** (Safari) | **Share** → **Add to Home Screen** → **Add**. |
| **Android** (Chrome) | **⋮** menu → **Add to Home screen** (or **Install app**). |

On iPhone, Safari can clear data for sites you haven't installed, so installing matters. The installed app keeps its own storage, separate from Safari's. If you started in Safari, use **Settings → Export backup** there and **Import backup** in the installed app.

## Keyboard shortcuts

Press <kbd>?</kbd> in the app to see them all.

| Key | Action |
|---|---|
| <kbd>C</kbd> <kbd>O</kbd> <kbd>D</kbd> <kbd>P</kbd> <kbd>R</kbd> | Start / stop class, open mat, drilling, comp, round (with <kbd>Shift</kbd>: log a finished one) |
| <kbd>U</kbd> | Undo |
| <kbd>G</kbd> <kbd>T</kbd> <kbd>V</kbd> | Progress, technique library, paste a class note |
| <kbd>F</kbd> | Edit "Working on" |
| <kbd>M</kbd> | Copy the last 7 days as Markdown |
| <kbd>,</kbd> | Settings |

## Shortcuts, Siri and links

Any link with `?do=` logs something when opened, with the usual Undo. **Settings → Shortcuts and Siri** lists ready-made links to copy.

| Link | Does |
|---|---|
| `?do=log&type=open-mat&min=60` | Log a 60-minute open mat that just ended |
| `?do=toggle&type=class` | Start or stop class (also `open-mat`, `drilling`, `comp`, `roll`) |
| `?do=log&type=class&min=90&gi=nogi&tech=knee cut,arm triangle` | A finished no-gi class with techniques |
| `?do=log&type=roll&partner=Jo&belt=blue&sub=rnc&tapped=triangle&stuck=half guard` | A round |
| `&ago=30` | It ended (or started) 30 minutes ago |

- **iPhone:** Shortcuts → New Shortcut → **Open URLs**, paste a link, name it "Log open mat". Then say "Hey Siri, log open mat". Links open in Safari, which keeps its own data, separate from the Home Screen app.
- **Android and desktop:** long-press the installed app's icon for Class, Open mat and Round.
- **AI agents and scripts** driving the page can call `window.matlog` (see [`llms.txt`](public/llms.txt)).

## Class notes in Markdown

Paste this (or your own version) with <kbd>V</kbd>:

```markdown
## No-gi class 2026-10-08 18:00
Length: 90m
Techniques: knee cut, arm triangle
Good rounds, cardio was rough.

### Rolls
- Sam (purple, bigger): hit armbar; tapped to triangle; stuck in half guard
- Jo (white): hit rnc
```

A heading that names a session (class, open mat, drilling, comp) starts one, and a "Rolls" heading lists rounds. Common names are recognised ("knee slice" is a knee cut, "rear naked" is an RNC); anything else is kept as you typed it. Export writes the same format, so a copied week pastes back in cleanly.

## Privacy

Everything stays in your browser: IndexedDB, with a second copy in localStorage. There are no accounts, servers or analytics, and the only network request is for fonts. Partner names never leave your device unless you export them. Export a backup now and then from Settings; importing merges, so it also moves your log between devices.

## Development

Requires Node 24.

```sh
npm install
npm run dev        # http://localhost:5173/matlog/
npm run check      # typecheck + unit + end-to-end tests; run before committing
SCREENSHOTS=1 npx playwright test screenshots --project=chromium   # refresh docs/*.png
```

| | |
|---|---|
| Stack | Vite + TypeScript (no UI framework), hand-written SVG charts and companion, vite-plugin-pwa |
| Storage | IndexedDB with a localStorage mirror; settings in localStorage |
| Unit tests | Vitest (jsdom), run in `America/New_York` to catch DST bugs |
| E2E tests | Playwright on Chromium, WebKit, an Android phone, iPhone layout, and the production build (offline) |
| CI / deploy | Every push runs the tests; `main` deploys to GitHub Pages only if they pass |

The plan, competitor notes and decisions log are in [`PLAN.md`](PLAN.md), and conventions for contributors (human or AI) are in [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE) © 2026 Sam Parmar
