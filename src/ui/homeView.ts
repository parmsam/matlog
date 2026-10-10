import { positionLabel, subLabel, techniqueLabel } from '../core/catalog';
import { addDays, dayDate, dayKey, dayStart } from '../core/days';
import { isSession, minutesOf } from '../core/events';
import { ago, clockTime, dayTitle, duration, hours, plural, timer } from '../core/format';
import { KINDS, kindById, lastOf, ongoingFor, type KindId } from '../core/kinds';
import { app, settings } from '../core/log';
import { currentRank, matMinutes, nextPatch, rollsIn, weekRecap } from '../core/stats';
import type { LogEvent } from '../core/types';
import { holdKind, tapKind } from './actions';
import { BELT_LABEL, beltSwatch, esc } from './dom';
import { renderFocusCard } from './focusView';
import { injuryLine } from './injuriesView';
import { openSheet } from './sheet';

const HOLD_MS = 450;
const MIN = 60_000;

/** Builds the cards once; `renderCards` only updates their text. Tap toggles, hold opens the sheet. */
export function mountCards(el: HTMLElement) {
  el.innerHTML = KINDS.map(
    (k) => `<button type="button" class="card" data-card="${k.id}" style="--c: var(--k-${k.id})" aria-keyshortcuts="${k.key}">
      <span class="emoji" aria-hidden="true">${k.emoji}</span><span class="label">${k.label}</span><span class="sub"></span></button>`,
  ).join('');
  el.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => {
    const id = b.dataset.card as KindId;
    let timer: number | undefined;
    let held = false;
    const cancel = () => clearTimeout(timer);
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      held = false;
      timer = window.setTimeout(() => {
        held = true;
        navigator.vibrate?.(12);
        holdKind(id);
      }, HOLD_MS);
    });
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (held) {
        held = false;
        return;
      }
      tapKind(id);
    });
  });
}

export function renderCards(el: HTMLElement, now: number) {
  const { events } = app.get();
  const { hiddenCards: hidden, cardsLogPast: past } = settings.get();
  for (const k of KINDS) {
    const b = el.querySelector<HTMLElement>(`[data-card="${k.id}"]`);
    if (!b) continue;
    const on = ongoingFor(events, k.id);
    // A hidden card still shows while it's running, so it can be stopped.
    b.hidden = hidden.includes(k.id) && !on;
    b.classList.toggle('running', !!on);
    const sub = b.querySelector('.sub')!;
    let text: string;
    if (on) text = timer(now - on.at);
    else {
      const last = lastOf(events, k.id, now);
      text = last ? ago(last.at, now) : past ? 'tap to log' : k.id === 'roll' ? 'round timer' : 'tap to start';
    }
    if (sub.textContent !== text) sub.textContent = text;
    const label = on
      ? `${k.label}: running ${duration(now - on.at)}. Tap to stop, hold for details.`
      : past
        ? `${k.label}: tap to log one you already did.`
        : `${k.label}: tap to start, hold to log one you already did.`;
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
  }
}

export function renderHero(now: number) {
  const prefs = settings.get();
  const { events } = app.get();
  const rank = currentRank(events, prefs, now);
  const rankEl = document.getElementById('rank')!;
  const rankHtml = `${beltSwatch(rank.belt, rank.stripes)} ${BELT_LABEL[rank.belt]} belt${rank.stripes ? ` · ${plural(rank.stripes, 'stripe')}` : ''}`;
  if (rankEl.innerHTML !== rankHtml) rankEl.innerHTML = rankHtml;
  document.documentElement.style.setProperty('--belt-color', `var(--belt-${rank.belt})`);
  const total = matMinutes(events, now);
  const next = nextPatch(total);
  const hoursText = `${hours(total)} on the mat${next ? ` · ${hours(next.hours * 60 - total)} to the ${next.label} patch` : ' · every patch earned'}`;
  const hEl = document.getElementById('hours')!;
  if (hEl.textContent !== hoursText) hEl.textContent = hoursText;
  renderFocusCard(now);
  const inj = document.getElementById('injury-line')!;
  const line = injuryLine(now);
  if (inj.textContent !== line) inj.textContent = line;
  inj.hidden = !line;
}

function rollRow(r: LogEvent, now: number): string {
  const d = r.detail ?? {};
  const bits: string[] = [];
  if (d.subsFor?.length) bits.push(`<span class="sub-for">✓ ${esc(d.subsFor.map(subLabel).join(', '))}</span>`);
  if (d.subsAgainst?.length) bits.push(`<span class="sub-against">✗ ${esc(d.subsAgainst.map(subLabel).join(', '))}</span>`);
  if (d.landed?.length) bits.push(`<span class="sub-for">↗ ${esc(d.landed.map(techniqueLabel).join(', '))}</span>`);
  if (d.tried?.length) bits.push(`tried ${esc(d.tried.map(techniqueLabel).join(', '))}`);
  if (d.stuck?.length) bits.push(`stuck: ${esc(d.stuck.map(positionLabel).join(', '))}`);
  if (d.outcome) bits.push(d.outcome);
  const running = r.endAt === undefined && !d.min;
  const who = d.partner ? esc(d.partner) : 'Round';
  const size = d.size && d.size !== 'similar' ? ` · ${d.size}` : '';
  return `<li><button type="button" class="roll-row" data-entry="${r.id}">
    <span class="dot" style="--sw: ${d.belt ? `var(--belt-${d.belt})` : 'var(--k-roll)'}" aria-hidden="true"></span>
    <span><span class="entry-title">${who}</span>${d.belt ? `<span class="entry-meta"> · ${d.belt}${size}</span>` : ''}${bits.length ? `<br /><span class="entry-meta">${bits.join(' · ')}</span>` : ''}</span>
    <span class="entry-time">${running ? '<span class="tag live">live</span>' : `${minutesOf(r, now)}m`}</span></button></li>`;
}

function sessionItem(s: LogEvent, events: LogEvent[], now: number): string {
  const k = kindById(s.type as KindId);
  const d = s.detail ?? {};
  const running = s.endAt === undefined && !d.min;
  const rs = s.type === 'study' ? [] : rollsIn(s, events, now);
  const meta: string[] = [];
  if (d.topic) meta.push(`<b>${esc(d.topic)}</b>`);
  if (d.source) meta.push(esc(d.source));
  if (d.enjoy) meta.push(['😩', '🙁', '😐', '🙂', '😄'][d.enjoy - 1]);
  if (d.reflectedAt) meta.push('📓');
  if (d.attire) meta.push(d.attire === 'gi' ? 'Gi' : 'No-gi');
  if (d.techniques?.length) meta.push(esc(d.techniques.map(techniqueLabel).join(', ')));
  if (rs.length) meta.push(plural(rs.length, 'round'));
  if (d.note) meta.push(`📝 ${esc(d.note.length > 60 ? `${d.note.slice(0, 60)}…` : d.note)}`);
  const when = `${dayTitle(dayDate(dayKey(s.at)))} · ${clockTime(s.at, settings.get().clock)}`;
  return `<li class="entry"><button type="button" class="entry-main" data-entry="${s.id}">
      <span class="emoji" aria-hidden="true">${k.emoji}</span>
      <span><span class="entry-title">${k.label}</span> ${running ? '<span class="tag live">live</span>' : `<span class="tag">${duration(minutesOf(s, now) * MIN)}</span>`}
        ${meta.length ? `<br /><span class="entry-meta">${meta.join(' · ')}</span>` : ''}</span>
      <span class="entry-time">${when}</span></button>
    ${rs.length ? `<ol class="rolls">${rs.map((r) => rollRow(r, now)).join('')}</ol>` : ''}</li>`;
}

let lastKey = '';

/** Recent sessions (two weeks, at least five) with their rounds, promotions, and rounds outside any session. */
export function renderRecent(now: number) {
  const { events } = app.get();
  const live = events.filter((e) => !e.deleted && e.at <= now + MIN);
  const cutoff = dayStart(addDays(dayKey(now), -14));
  const sorted = [...live].sort((a, b) => b.at - a.at);
  const sessions = sorted.filter((e) => isSession(e) || e.type === 'study');
  const shown = sessions.filter((s, i) => i < 5 || s.at >= cutoff).slice(0, 40);
  const oldest = shown.at(-1)?.at ?? now;
  const inSession = new Set(shown.flatMap((s) => rollsIn(s, events, now).map((r) => r.id)));
  const loose = sorted.filter((e) => e.type === 'roll' && !inSession.has(e.id) && e.at >= Math.min(oldest, cutoff));
  const promos = sorted.filter((e) => e.type === 'promotion' && e.at >= Math.min(oldest, cutoff));
  const items = [...shown.map((s) => ({ at: s.at, html: sessionItem(s, events, now) })), ...loose.map((r) => ({ at: r.at, html: `<li class="entry"><ol class="rolls" style="border:0;padding:0">${rollRow(r, now)}</ol></li>` })), ...promos.map((p) => ({ at: p.at, html: `<li class="entry"><button type="button" class="entry-main" data-entry="${p.id}"><span class="emoji" aria-hidden="true">🎖️</span><span><span class="entry-title">Promoted: ${BELT_LABEL[p.detail?.belt ?? 'white']} belt${p.detail?.stripes ? `, ${plural(p.detail.stripes, 'stripe')}` : ''}</span></span><span class="entry-time">${dayTitle(dayDate(dayKey(p.at)))}</span></button></li>` }))].sort((a, b) => b.at - a.at);
  // Rebuild only when something visible changed (timers tick in the cards, not here, except "live" lengths).
  const html = items.map((i) => i.html).join('');
  const list = document.getElementById('entries')!;
  if (html !== lastKey) {
    list.innerHTML = html;
    lastKey = html;
  }
  document.getElementById('entries-empty')!.hidden = items.length > 0;

  const r = weekRecap(events, dayKey(now), now);
  const week = r.sessions
    ? `Last 7 days: ${plural(r.sessions, 'session')}, ${duration(r.minutes * MIN)}${r.rolls ? `, ${plural(r.rolls, 'round')}` : ''}${r.subsFor || r.subsAgainst ? ` · ${plural(r.subsFor, "sub")} hit, ${plural(r.subsAgainst, "tap")}` : ''}.`
    : '';
  const wl = document.getElementById('week-line')!;
  if (wl.textContent !== week) wl.textContent = week;
  wl.hidden = !week;
}

export function mountRecent() {
  document.getElementById('entries')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-entry]');
    if (!b) return;
    const ev = app.get().events.find((x) => x.id === b.dataset.entry);
    if (ev) openSheet({ event: ev });
  });
  document.getElementById('add-entry')!.addEventListener('click', () => openSheet({ type: 'class' }));
}
