import { addDays, dayDate, dayKey, dayStart } from '../core/days';
import { duration, hours, plural } from '../core/format';
import { app, deleteEvent, revertTo, settings } from '../core/log';
import { toMarkdown } from '../core/markdown';
import { matMinutes, patterns, PATCHES, rankTimeline, rollStats, sessions, weekHeatmap, weekRecap, type Count } from '../core/stats';
import { heatmapSvg } from '../viz/heatmap';
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

    <section class="block"><h3>Where you got stuck</h3>
      <p class="basis">${rs.stuckRolls ? `From ${plural(rs.stuckRolls, 'round')} where you noted a position.` : 'Add "where you got stuck" to a round to see it here.'}</p>
      ${bars(rs.stuck, 'var(--k-drilling)', '', 8)}
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
