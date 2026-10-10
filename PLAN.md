# matlog: plan

A BJJ training journal. One tap logs a class, open mat, drilling session or comp; a round timer
runs alongside it; and there are good ways to see your progress. It's a static site on GitHub Pages and an
installable PWA. **All data stays on the device.**

matlog uses the same template as [tinylog](https://github.com/parmsam/tinylog): the same stack, conventions and "one tap, log late, patterns not advice"
rules. The domain is new, and the field is mostly subscription apps and generic notes apps.

## Principles
1. **One tap, sweaty hands.** The home screen is big buttons. Logging never needs a form; detail is optional and can be added later.
2. **Logging late is normal.** Most entries happen in the car after class. Every log gets **Undo** and **−5m / −15m / −30m**, and a finished session can be logged with its length in one step (`?do=log&type=open-mat&min=60`).
3. **Patterns, never advice.** "You noted getting stuck in half guard most: 5 rolls." Never "work on your half guard". Each pattern says what it's based on and stays hidden until there's enough data. No AI coach, no scores, no recommendations.
4. **Nothing is ever lost.** No streaks to break. Patches are earned for cumulative mat hours and stay earned.
5. **Private by design.** No backend, no analytics, no accounts. Partner names never leave the device unless you export.

## What the field does, and what we take from it
Checked 2026-10-09 (see the README for the table).
- **BJJ Notes** (free + Pro $7.90/mo, $59.90/yr or $149 lifetime; iOS/Android, account, cloud sync): session journal, technique focus goals, sub/tap analytics, weekly recaps, AI insights. *Take:* a "Working on" focus line and a weekly recap. *Skip:* AI insights, accounts.
- **BJJBuddy** (free; $5.99/mo or $39.99/yr; iOS/Android): roll journal with sub/tap charts, social follow, video recommendations "based on your stats". *Take:* subs-by-partner-belt breakdown. *Skip:* recommendations (advice), social.
- **BetterBJJ** (iOS/Android): voice-first logging, AI game plans, proficiency scores. Their pitch against other apps is "23 fields, 8 screens". *Take:* that friction is the enemy; Markdown paste covers dictated notes without AI. *Skip:* scores and plans.
- **MatTime** ($9.99 lifetime, iOS only): fast mat-hour logging ("14 seconds"), weekly goals, streaks, gym leaderboards. *Take:* mat hours front and centre. *Skip:* streaks (guilt) and leaderboards.
- **Grapl, GrappleKit** (subscriptions): curriculum, round timer, playlists. *Take:* a round timer belongs in the journal.
- **Obsidian** (free for personal use; Sync $4–5/mo): local Markdown vaults on every platform. *Take:* Markdown export that drops into a vault. *Skip:* nothing to skip, it's a companion, not a competitor.
- **Notes apps / paper**: free and flexible, but no stats. *Take:* Markdown in and out, so a notes app stays a fine companion.
- "Grapple Log" turned up no app by that name.

## Stack (same as tinylog)
- Vite + TypeScript (strict), no UI framework, plain DOM modules
- Hand-written SVG charts (heatmap, position graph, rank timeline), CSS animation for the companion
- vite-plugin-pwa (`registerType: 'prompt'`, never auto-reload mid-round)
- Vitest (jsdom, `TZ=America/New_York`) + Playwright (Chromium, WebKit, a phone)
- GitHub Actions: CI on every push, deploy to Pages (`base: '/matlog/'`) only when it passes

## Core technical decisions
1. **Event log is the source of truth.** Sessions, rounds and promotions are events; mat hours, heatmaps, ratios, "last drilled", the position graph and the rank timeline are all derived.
   ```ts
   type EventType = 'class' | 'open-mat' | 'drilling' | 'comp' | 'roll' | 'promotion'
   interface LogEvent {
     id: string; type: EventType
     at: number            // start, epoch ms
     endAt?: number        // undefined while running (or when logged with a length)
     detail?: {
       attire?: 'gi' | 'nogi'; techniques?: string[]; min?: number       // sessions
       partner?: string; belt?: Belt; size?: 'smaller' | 'similar' | 'bigger'
       subsFor?: string[]; subsAgainst?: string[]; stuck?: string[]; outcome?: 'win' | 'loss' | 'draw'  // rolls
       stripes?: number    // promotion (with belt)
       note?: string
     }
     createdAt: number; updatedAt: number; deleted?: boolean
   }
   ```
2. **Timers are timestamps.** A running class or round is an event with no `endAt`; elapsed time comes from `Date.now()`, so it survives reloads, locked phones and closed tabs.
3. **Rounds belong to sessions by time**, not by id: a roll during a class is shown under it. Ending a session ends its round.
4. **One session at a time.** Starting open mat while class runs switches the running session's kind (class ran into open mat) instead of starting a second.
5. **Storage**: IndexedDB primary, mirrored to localStorage (`matlog:v1:mirror`); settings in `matlog:v1:settings`. JSON export/import merges by id, newest `updatedAt` wins.
6. **Vocabulary** (`core/catalog.ts`): positions, techniques with from → to positions, and submissions with aliases. Anything typed that isn't in the catalog is kept as free text, never rejected.
7. **One logging path**: card taps, `?do=` links, pasted Markdown and `window.matlog` all go through `core/ops.ts`.

## Features
### Logging
- [x] Cards: Class, Open mat, Drilling, Comp (sessions), Round (timer). Tap to start, tap to stop. Survives reloads.
- [x] Toast with Undo, −5m / −15m / −30m and Details after every log.
- [x] Hold a card for the detail sheet (gi/no-gi, techniques, length, note); Round's sheet has partner, belt, size, subs hit and tapped to, stuck positions.
- [x] Stopping a round offers the roll sheet (skippable), since that's when you know what happened.
- [x] Log a finished session with its length (the sheet's "Already done" toggle, or `min=` in a link).
- [x] Paste a Markdown class note to log it (session + rolls), with a preview before saving.
- [x] "Working on" card: its own sheet with quick fills from your log, history and "use again"; counts what happens with a named technique, position or sub since you set it.
- [x] Moves landed and tried in each round (sweeps, passes, takedowns…), shown as "landed X of Y".
- [x] Edit and delete any entry; recent sessions list with rounds nested under them.

### Seeing progress
- [x] Mat hours (all time, this week, this year) and session/roll counts.
- [x] Week-by-week heatmap (26 weeks × 7 days), with a text equivalent.
- [x] Subs for / against: ratio, top subs each way, by partner belt.
- [x] Where you got stuck, ranked.
- [x] Stripe and belt timeline, with mat hours between promotions.
- [x] Patterns: plain sentences with "based on N".
- [x] Weekly recap.

### Technique library
- [x] Tag techniques per session (catalog suggestions + free text).
- [x] "Last drilled" list: each technique, sessions tagged, days since.
- [x] Position graph built from your own logs (standing → guard → passing → dominant → submission), edges weighted by sessions.

### Delight
- [x] Six buddies (Grappler, Bear, Sloth, Octopus, Frog, Cat) or a different one each day, on one shared rig.
- [x] Belt splash on open, on by default, toggle in Settings; links skip it.
- [x] Companion that ties its belt when a session starts, taps out when you log a tap, celebrates a finish, and wears your belt color and stripes.
- [x] Gi / no-gi themes (auto follows the system).
- [x] Patches unlocked at 10, 25, 50, 100, 250, 500 and 1,000 mat hours, worn on the companion.

### Template features
- [x] `?do=` links for Shortcuts/Siri and the PWA's long-press shortcuts.
- [x] `window.matlog` scripting API and `public/llms.txt`.
- [x] Markdown export (copy any range) and import (paste).
- [x] JSON backup export/import with merge.
- [x] Backup reminder banner with Back up now (share sheet on phones) and Not now; interval in Settings (3/7/14/30 days or only every 30 entries).
- [x] Keyboard shortcuts.
- [x] Comparison table in the README.

### Later
- [ ] Injury log (BJJ Notes has one): descriptive only, never medical advice.
- [ ] Shareable recap image.
- [ ] Per-technique notes page.
- [ ] Screenshots in `docs/`.

## Decisions log
- 2026-10-09: v0.2.0. Moves landed/tried per round (`detail.landed`, `detail.tried`): an attempt is a round where you went for it, landed or not, and misses don't draw edges on the position graph. Backup reminders ported from tinylog with matlog thresholds (30 entries; 7 days by default). "Working on" got its own sheet; it matches a technique, position or sub inside the sentence (subs win over the same-named technique, since they count taps too) and counts events that end after it was set. Redrew the buddy as one shared rig with six characters. Splash on by default, skipped for `?do=` links.
- 2026-10-09: v0.1.0. Started from tinylog's template. All five cards are timed; a finished entry is an event with `detail.min` and no `endAt`. Rounds belong to sessions by time. Patches instead of streaks. No anime.js or three.js: the companion is CSS-animated SVG, to keep the bundle small.
