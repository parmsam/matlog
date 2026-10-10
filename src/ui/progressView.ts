import { addDays, dayDate, dayKey, dayStart } from '../core/days';
import { duration, hours, plural } from '../core/format';
import { app, deleteEvent, revertTo, settings } from '../core/log';
import { toMarkdown } from '../core/markdown';
import { matMinutes, moveStats, positionalStats, patterns, PATCHES, rankTimeline, rollStats, sessions, weekHeatmap, weekRecap, type Count } from '../core/stats';
import { heatmapSvg } from '../viz/heatmap';
import { blocksSvg } from '../viz/blocks';
import { focuses } from '../core/focus';
import { processStats } from '../core/notebook';
import { injuryStats } from '../core/injuries';
import { openInjuries } from './injuriesView';
import { openProblems } from './problemsView';
import { patchSvg } from '../viz/patch';
import { BELT_LABEL, beltSwatch, copyText, esc, openDialog, sheetHead } from './dom';
import { openSheet } from './sheet';
import { toast } from './toast';

const MIN = 60_000;
const WEEKS = 26;
const dialog = () => document.getElementById('progress') as HTMLDialogElement;

function bars(list: Count[], color: string, empty: string, max = 6): string {
  if (!list.length) return `<p class="empty">${empty}</p>`;
  const top = Math.max(...list.map((c) => c.n));
  return `<div class="bars">${list
    .slice(0, max)
    .map((c) => `<div class="bar-row" style="--c: ${color}"><span>${esc(c.label)}</span><span class="track"><span class="fill" style="display:block;width:${(c.n / top) * 100}%"></span></span><span class="n">${c.n}</span></div>`)
    .join('')}</div>`;
}

function render() {
  const now = Date.now();
  const prefs = settings.get();
  const { events } = app.get();
  const today = dayKey(now);
  const total = matMinutes(events, now);
  const year = matMinutes(events, now, new Date(new Date(now).getFullYear(), 0, 1).getTime());
  const ss = sessions(events);
  const rs = rollStats(events);
  const recap = weekRecap(events, today, now);
  const hm = weekHeatmap(events, today, WEEKS, prefs.weekStart, now);
  const pats = patterns(events, now);
  const steps = rankTimeline(events, prefs, now);
  const moves = moveStats(events);
  const proc = processStats(events);
  const fv = focuses(events, now);
  const pos = positionalStats(events);
  const inj = injuryStats(events, now);
  const moveRounds = events.filter((e) => !e.deleted && e.type === 'roll' && (e.detail?.landed?.length || e.detail?.tried?.length)).length;

  const ratio =
    rs.subsFor + rs.subsAgainst
      ? `<div class="ratio" role="img" aria-label="${rs.subsFor} subs hit, ${rs.subsAgainst} taps"><span class="f" style="width:${(rs.subsFor / (rs.subsFor + rs.subsAgainst)) * 100}%"></span><span class="a" style="flex:1"></span></div>
        <p class="basis">${rs.subsFor} hit · ${rs.subsAgainst} tapped${rs.ratio !== null ? ` · ${rs.ratio.toFixed(2)} hit per tap` : ''} · over ${plural(rs.rolls, 'round')}</p>`
      : '<p class="empty">Log a round with a sub or a tap to see the ratio.</p>';

  const byBelt = rs.byBelt.length
    ? `<table class="data"><thead><tr><th>Partner belt</th><th class="num">Rounds</th><th class="num">Hit</th><th class="num">Tapped</th></tr></thead><tbody>${rs.byBelt
        .map((b) => `<tr><td>${beltSwatch(b.belt)} ${BELT_LABEL[b.belt]}</td><td class="num">${b.rolls}</td><td class="num">${b.subsFor}</td><td class="num">${b.subsAgainst}</td></tr>`)
        .join('')}</tbody></table>`
    : '';

  const timeline = `<ol class="timeline">${steps
    .map(
      (s, i) => `<li><span class="knot">${beltSwatch(s.belt, s.stripes)}</span>
      <span><b>${BELT_LABEL[s.belt]}${s.stripes ? `, ${plural(s.stripes, 'stripe')}` : ''}</b>${i === 0 ? ' <span class="entry-meta">(where you started)</span>' : `<br /><span class="entry-meta">${hours(s.minutesBefore)} logged since the last step</span>`}</span>
      <span class="when">${s.at ? `${dayDate(dayKey(s.at)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${s.id ? ` <button type="button" class="chip" data-del-promo="${s.id}" aria-label="Delete this promotion">×</button>` : ''}` : ''}</span></li>`,
    )
    .join('')}</ol>`;

  const textTable = `<table class="data"><thead><tr><th>Week of</th><th class="num">Mat time</th></tr></thead><tbody>${hm.weeks
    .map((w, i) => ({ w, m: hm.weekMinutes[i] }))
    .reverse()
    .filter((x) => x.m)
    .map((x) => `<tr><td>${dayDate(x.w).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td><td class="num">${duration(x.m * MIN)}</td></tr>`)
    .join('')}</tbody></table>`;

  dialog().innerHTML = `${sheetHead('progress-title', 'Progress')}<div class="sheet-body">
    <div class="tiles">
      <div class="tile"><div class="v">${hours(total)}</div><div class="k">on the mat</div></div>
      <div class="tile"><div class="v">${hours(year)}</div><div class="k">this year</div></div>
      <div class="tile"><div class="v">${ss.length}</div><div class="k">sessions</div></div>
      <div class="tile"><div class="v">${rs.rolls}</div><div class="k">rounds</div></div>
    </div>

    <section class="block"><h3>Last 7 days</h3>
      <p class="basis">${dayDate(recap.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${dayDate(recap.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
      ${recap.sessions ? `<p>${plural(recap.sessions, 'session')}, ${duration(recap.minutes * MIN)} on the mat${recap.rolls ? `, ${plural(recap.rolls, 'round')} (${plural(recap.subsFor, "sub")} hit, ${plural(recap.subsAgainst, "tap")})` : ''}.${recap.techniques.length ? ` Techniques: ${esc(recap.techniques.join(', '))}.` : ''}</p>` : '<p class="empty">Nothing in the last 7 days.</p>'}
      <button type="button" class="chip" data-copy="7">Copy last 7 days as Markdown</button>
      <button type="button" class="chip" data-copy="30">Last 30 days</button>
      <button type="button" class="chip" data-copy="all">Everything</button>
    </section>

    <section class="block"><h3>Week by week</h3>
      <p class="basis">Mat time per day, last ${WEEKS} weeks. Darker is more.</p>
      <div class="viz">${heatmapSvg(hm, prefs.weekStart)}</div>
      <div class="legend">Less <i class="hm-0" style="background:var(--faint)"></i><i style="background:var(--h1)"></i><i style="background:var(--h2)"></i><i style="background:var(--h3)"></i><i style="background:var(--h4)"></i> More</div>
      <details class="text-alt"><summary>As a table</summary>${textTable}</details>
    </section>

    <section class="block"><h3>Subs for and against</h3>
      ${ratio}
      <div class="two-col">
        <div><h4>You finished</h4>${bars(rs.forBy, 'var(--accent)', 'None logged yet.')}</div>
        <div><h4>You tapped to</h4>${bars(rs.againstBy, 'var(--danger)', 'None logged yet.')}</div>
      </div>
      ${byBelt ? `<div class="block">${byBelt}</div>` : ''}
    </section>

    <section class="block"><h3>Moves in rounds</h3>
      ${moves.length ? `<p class="basis">Landed, of rounds where you went for it. From ${plural(moveRounds, 'round')} with moves noted.</p>
      <div class="bars">${moves
        .slice(0, 8)
        .map((m) => `<div class="bar-row"><span>${esc(m.label)}</span><span class="track" role="img" aria-label="landed ${m.landed} of ${m.attempts}"><span class="fill" style="display:block;width:${(m.attempts / moves[0].attempts) * 100}%;background:linear-gradient(90deg, var(--accent) 0 ${(m.landed / m.attempts) * 100}%, color-mix(in oklab, var(--accent) 30%, transparent) ${(m.landed / m.attempts) * 100}% 100%)"></span></span><span class="n" style="min-width:3.2em">${m.landed}/${m.attempts}</span></div>`)
        .join('')}</div>` : '<p class="empty">Note moves you landed or went for when you log a round (sweeps, passes, takedowns, back takes).</p>'}
    </section>

    <section class="block"><h3>Where you got stuck</h3>
      <p class="basis">${rs.stuckRolls ? `From ${plural(rs.stuckRolls, 'round')} where you noted a position.` : 'Add "where you got stuck" to a round to see it here.'}</p>
      ${bars(rs.stuck, 'var(--k-drilling)', '', 8)}
    </section>

    <section class="block"><h3>How sessions felt</h3>
      ${proc.rated || proc.plan.yes + proc.plan.partly + proc.plan.no ? `<div class="tiles">
        <div class="tile"><div class="v">${proc.enjoyAvg !== null ? proc.enjoyAvg.toFixed(1) : '–'}</div><div class="k">enjoyment, of 5 (${plural(proc.rated, 'session')})</div></div>
        <div class="tile"><div class="v">${proc.plan.yes + proc.plan.partly + proc.plan.no ? `${proc.plan.yes}/${proc.plan.yes + proc.plan.partly + proc.plan.no}` : '–'}</div><div class="k">followed the plan${proc.plan.partly ? ` (${proc.plan.partly} partly)` : ''}</div></div>
        <div class="tile"><div class="v">${proc.reflected}</div><div class="k">sessions reflected on</div></div>
      </div>
      ${proc.enjoyByMonth.length > 1 ? `<div class="bars">${proc.enjoyByMonth
        .slice(-6)
        .map((m) => `<div class="bar-row"><span>${new Date(`${m.month}-15T12:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span><span class="track"><span class="fill" style="display:block;width:${(m.avg / 5) * 100}%"></span></span><span class="n">${m.avg.toFixed(1)}</span></div>`)
        .join('')}</div><p class="basis">Average enjoyment by month, from your check-ins.</p>` : ''}` : '<p class="empty">Rate how a session felt and whether you followed your plan when you reflect, or in a session’s details. Judge a session by how you trained, not by taps.</p>'}
      <p class="basis">${plural(proc.problemsOpen, 'open problem')} · ${proc.problemsSolved} solved${proc.tinkered ? ` (${proc.tinkered} after tinkering first)` : ''} <button type="button" class="chip" data-problems>Problems</button></p>
    </section>

    <section class="block"><h3>Focus blocks</h3>
      ${fv.length ? `<div class="viz">${blocksSvg(fv, now)}</div><p class="basis">Each bar is a block of work on a focus; gaps are rests.</p>` : '<p class="empty">Set what you’re working on (the card on the home screen) and its blocks show here.</p>'}
    </section>

    <section class="block"><h3>Positional rounds</h3>
      ${pos.positional ? `<p class="basis">${pos.positional} of ${plural(pos.rolls, 'round')} started from a position${pos.badSpots ? `, ${pos.badSpots} from a bad spot (bottom of a pin, or turtle)` : ''}.</p>${bars(pos.byStart, 'var(--k-roll)', '', 8)}` : '<p class="empty">Note where a round started (Started from) to see positional rounds here.</p>'}
    </section>

    <section class="block"><h3>Injuries</h3>
      ${inj.total ? `<div class="tiles">
        <div class="tile"><div class="v">${inj.active}</div><div class="k">active now</div></div>
        <div class="tile"><div class="v">${inj.daysThisYear}</div><div class="k">days with one this year</div></div>
        <div class="tile"><div class="v">${inj.sessionsWhileInjured}</div><div class="k">sessions trained around one</div></div>
        ${inj.medianDays !== null ? `<div class="tile"><div class="v">${inj.medianDays}</div><div class="k">days to heal, typically (median)</div></div>` : ''}
      </div>${bars(inj.byArea.map((a) => ({ id: a.area, label: a.label, n: a.n })), 'var(--k-comp)', '', 8)}` : '<p class="empty">No injuries logged. Here’s hoping it stays that way.</p>'}
      <p class="basis">From what you logged; not medical advice. <button type="button" class="chip" data-injuries>Injury log</button></p>
    </section>

    <section class="block"><h3>Patterns</h3>
      ${pats.length ? `<ul class="patterns">${pats.map((p) => `<li>${esc(p.text)}<small>Based on ${esc(p.basis)}.</small></li>`).join('')}</ul>` : '<p class="empty">Patterns show up after a few sessions and rounds. They describe your log; they never tell you what to do.</p>'}
    </section>

    <section class="block"><h3>Belt and stripes</h3>
      ${timeline}
      <p><button type="button" class="chip primary" data-promo>+ Log a promotion</button></p>
      <p class="hint" style="margin-top:4px">Where you started is in Settings.</p>
    </section>

    <section class="block"><h3>Patches</h3>
      <p class="basis">Earned by mat hours and never lost. Your buddy wears the ones you pick in Settings.</p>
      <div class="patches">${PATCHES.map((p) => `<div class="patch ${total >= p.hours * 60 ? '' : 'locked'}">${patchSvg(p.color, String(p.hours))}<span>${p.label}${total >= p.hours * 60 ? '' : ' (locked)'}</span></div>`).join('')}</div>
    </section>
  </div>`;
}

export function openProgress() {
  render();
  const d = dialog();
  if (!d.dataset.progressWired) {
    d.dataset.progressWired = '1';
    d.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      const copy = el.closest<HTMLElement>('[data-copy]')?.dataset.copy;
      if (copy) {
        const now = Date.now();
        const today = dayKey(now);
        const all = app.get().events.filter((x) => !x.deleted);
        const first = all.length ? dayKey(Math.min(...all.map((x) => x.at))) : today;
        const from = copy === 'all' ? first : addDays(today, -(Number(copy) - 1));
        const ok = await copyText(toMarkdown(app.get().events, from, today, now, settings.get().name));
        toast(ok ? 'Copied as Markdown' : "Couldn't copy");
        return;
      }
      if (el.closest('[data-injuries]')) {
        d.close();
        openInjuries();
        return;
      }
      if (el.closest('[data-problems]')) {
        d.close();
        openProblems();
        return;
      }
      if (el.closest('[data-promo]')) {
        d.close();
        openSheet({ type: 'promotion', at: dayStart(dayKey(Date.now())) + 12 * 3_600_000 });
        return;
      }
      const del = el.closest<HTMLElement>('[data-del-promo]')?.dataset.delPromo;
      if (del) {
        const prev = app.get().events.find((x) => x.id === del);
        deleteEvent(del);
        render();
        if (prev) toast('Promotion deleted', { actions: [{ label: 'Undo', primary: true, run: () => (revertTo(prev), render()) }] });
      }
    });
  }
  openDialog(d);
}
