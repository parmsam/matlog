---
name: matlog-note
description: Turn Brazilian jiu-jitsu training notes (a voice memo transcript, quick texts, a messy paragraph) into a matlog class note in Markdown, ready to paste into matlog. Use when someone wants to log a class, open mat, drilling session, comp or study session in matlog from free-form notes, or asks for their notes "in matlog format".
---

# matlog class note

matlog (https://parmsam.github.io/matlog/) is a local-only BJJ training journal. It reads class notes in the Markdown format below (Paste a note in the app, or `window.matlog.importMarkdown(text)` when driving the page). Your job is only to reformat what the person said.

## The format

```markdown
## Class
- Date: 2026-10-08 18:00
- Length: 90m
- Gi: no-gi
- Topic: Half guard passing

### Techniques
- Knee cut pass
  - Key detail: underhook the far arm first
- Shoulder post wrist grab arm drag

### Rounds
- Sam (purple, bigger)
  - Started from: half guard bottom
  - Hit: armbar
  - Tapped to: triangle
  - Landed: knee cut
  - Stuck: half guard

### Problems
- Got flattened in half guard
  - Idea: knee shield first

### Injuries
- Left knee (minor)
  - How: heel hook
  - Training around it: no leg locks

### Notes
Anything else, as free text.
```

- `## Class` starts a session: Class, Open mat, Drilling, Comp or Study. Several sessions can follow each other.
- Session details are bullets: Date (YYYY-MM-DD HH:MM), Length (90m, 1h30), Gi (gi or no-gi), Topic, Enjoyed (1–5), Followed my plan (yes, partly, no). Study also takes Source.
- `### Techniques`: one technique per bullet. Sub-bullets add notes to it: Key detail, Observation, Question, Source (a link in brackets works).
- `### Rounds` (or Rolls, Matches): one partner per bullet, with belt, size and length in brackets. Sub-bullets: Started from (a position, then top or bottom), Hit, Tapped to, Landed, Went for, Stuck, Result (win, draw, loss), Note. Lists are comma-separated.
- `### Problems`: one problem per bullet, `(solved)` at the end if it is. Sub-bullet: Idea.
- `### Injuries`: one per bullet, like `Left knee (minor)`. Sub-bullets: How, Training around it.
- `### Notes`: free text. Anything matlog doesn’t recognise also ends up in the note.

## How to write it

1. Only include what the person actually said. Leave out any section or line they said nothing about. Never invent rounds, partners, submissions, times or details.
2. Keep their own words for problems, ideas, technique notes and notes.
3. No advice, scores or suggestions: matlog describes training, it doesn't coach.
4. Dates are `YYYY-MM-DD HH:MM`. If they say "today" or "tonight", use today's date; if they don't say when, leave out the Date line (matlog uses now).
5. Prefer the technique names matlog knows when one fits (for example "Knee cut pass", "Armbar from guard", "Rear naked choke", "Scissor sweep", "Double leg", "Arm drag"); otherwise keep their name for it. matlog keeps unknown names as typed.
6. One session per `##` heading. A comp's rounds are matches: put `Result: win`, `draw` or `loss` under each.
7. Reply with only the Markdown.

## Putting it into matlog

- In the app: Paste a note (next to Add past session), paste, check the preview, Log it.
- Driving a browser with matlog open: `matlog.importMarkdown(text)`; `matlog.parseMarkdown(text)` previews without logging.
- Reference for agents: https://parmsam.github.io/matlog/llms.txt
