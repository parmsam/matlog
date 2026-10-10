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

## Train with intention (from our study guides)
Two study guides on skill development (an Atomic Dojo video on skill development, and a "jiu-jitsu operating system" video) shaped v0.3. They live in `ref/`, which is gitignored. What we took, as features that support *your* process (the app never picks your focus or judges a round):
- **Always have something you're working on**, a few connected skills deep rather than everything a little ("build across, not up"): **focus blocks** with roles (main skill, complementary, habit, experiment, side project).
- **Work a skill in ~2-week blocks, rest it, come back** (spaced practice), or "one position, one week, one outcome": blocks of 1 or 2 weeks with Rest it / Another block / Done, and block-by-block numbers to see what stuck after a break. A Progress chart shows the rhythm.
- **If it works → I go here; if it fails → I go here**: written on each focus.
- **Define success as 1–2 reps against live resistance**: an optional reps target per session on a focus ("1 of 2 reps today").
- **Find problems, solve them** (external, internal, predictive sources); **tinker before looking it up**: the Problems list with ideas, a "tinkered first" note and solved dates.
- **Take basic notes later, not straight after training; glance at them before rounds**: the reflection prompt (a while after a session, a setting) with the notebook template, and today's focus in the toast when a session starts.
- **Test new skills against people near your level; lighter → same → heavier**: the skill ladder per technique (partner size × belt relative to yours then).
- **Start rounds positionally; start from bad spots**: rounds record where they started and your side.
- **Process over outcome; am I enjoying this?**: a check-in on enjoyment and following the plan, summarised in Progress without scores.
- **The 5–10 minute study loop**: a Study card (hidden by default), logged but never counted as mat time.
- Left for later: the competition blueprint (comp-day checklist, game plan "wrestle or pull?", circles of control), and the four-phase order (escapes → offense from escapes → top → subs) as a focus template.

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

### Train with intention (v0.3)
- [x] Focus blocks: several at once, roles, 1- or 2-week blocks, rest / another block / done, if works → / if fails →, reps target, block-by-block numbers, v0.2 "Working on" migrated into the log.
- [x] Problems with source, idea to try, tinkered first, solved; open count on the home card.
- [x] Reflection prompt (Settings: right after, 1, 2 or 4 hours, or off) with the notebook template and a check-in (enjoyed it, followed my plan).
- [x] Skill ladder per technique; positional rounds (started from, top/bottom).
- [x] Progress: how sessions felt, focus blocks chart, positional rounds.
- [x] Study card (hidden by default), not mat time.
- [x] Your own techniques (type and from → to positions), in the log; they join suggestions, the graph and the ladder.
- [x] Classes start on the hour (default, a setting); the toast offers the exact time.
- [x] Open mat flow: Start open mat when a round starts alone, Next round after saving one, a session's rounds listed in its sheet with + Add a round.
- [x] Round clock (K): full screen, round and rest lengths, buzz at time, keeps the screen awake.
- [x] From tinylog: one-time tips, Settings → Buttons, install guide with an Install button, tap the buddy, backups carry your name and fall back to .txt on Android.
- [x] Icons: favicon.ico + PNG + SVG for tabs, a 180px apple-touch-icon for iOS, 192/512 and maskable PNGs for Android installs (`scripts/icons.mjs`).

### Later
- [ ] Comp-day checklist and game plan (from the operating-system guide).
- [ ] Injury log (BJJ Notes has one): descriptive only, never medical advice.
- [ ] Shareable recap image.
- [ ] Per-technique notes page.
- [ ] Screenshots in `docs/`.

## Decisions log
- 2026-10-09: v0.3.0, "train with intention". Focuses, problems and your own techniques are events (`focus`, `problem`, `technique`), so they back up, merge and undo like sessions; nothing new lives only in settings. A block's planned end is `from + blockDays`; a block that runs over ends there when rested. Reflection asks once per session (reflected or "Not now"), only for sessions that ended between `reflectAfter` and 36 hours ago, and the banner shows one thing at a time: backup, then reflection, then tips. The ladder compares the partner's belt with yours at the time of the round. Classes snap to the hour by default (logged after the fact: the hour at or before; live: within 10 minutes after); the toast offers the exact time. Study is its own kind, hidden by default, never mat time. Toasts created just before a sheet closes are moved out of it (they used to vanish with the sheet). Icons are PNGs rendered from one SVG mark by `scripts/icons.mjs`.
- 2026-10-09: v0.2.0. Moves landed/tried per round (`detail.landed`, `detail.tried`): an attempt is a round where you went for it, landed or not, and misses don't draw edges on the position graph. Backup reminders ported from tinylog with matlog thresholds (30 entries; 7 days by default). "Working on" got its own sheet; it matches a technique, position or sub inside the sentence (subs win over the same-named technique, since they count taps too) and counts events that end after it was set. Redrew the buddy as one shared rig with six characters. Splash on by default, skipped for `?do=` links.
- 2026-10-09: v0.1.0. Started from tinylog's template. All five cards are timed; a finished entry is an event with `detail.min` and no `endAt`. Rounds belong to sessions by time. Patches instead of streaks. No anime.js or three.js: the companion is CSS-animated SVG, to keep the bundle small.
