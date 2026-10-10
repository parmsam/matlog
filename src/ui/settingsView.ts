import { BELTS, type Belt, type CompanionChoice, type ReflectAfter } from '../core/types';
import { KINDS } from '../core/kinds';
import { isStandalone } from './banner';
import { BUDDIES, type BuddyId } from './companion';
import { BackupError, parseBackup } from '../core/backup';
import { BACKUP_EVERY } from '../core/backupReminder';
import { BACKUP_DAY_CHOICES } from '../core/settings';
import { hours } from '../core/format';
import { app, importData, settings } from '../core/log';
import { matMinutes, PATCHES } from '../core/stats';
import { patchSvg } from '../viz/patch';
import { backUpNow } from './backup';
import { BELT_LABEL, copyText, esc, openDialog, sheetHead } from './dom';
import { storageStatus } from './persist';
import { toast } from './toast';
import { askToNotify, canNotify } from './reflectNotify';

const dialog = () => document.getElementById('settings') as HTMLDialogElement;

/** Ready-made links for Shortcuts, Siri and bookmarks. */
export const LINKS: [string, string][] = [
  ['Start or stop class', '?do=toggle&type=class'],
  ['Log a 60 minute open mat', '?do=log&type=open-mat&min=60'],
  ['Log a 90 minute no-gi class', '?do=log&type=class&min=90&gi=nogi'],
  ['Start or stop a round', '?do=toggle&type=roll'],
  ['Log 10 minutes of study', '?do=log&type=study&min=10'],
  ['Log a 45 minute drilling session, 30 minutes ago', '?do=log&type=drilling&min=45&ago=30'],
];

/** Chrome's own install prompt, kept for the Install button instead of popping up by itself. */
let installPrompt: { prompt(): Promise<unknown> } | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as unknown as { prompt(): Promise<unknown> };
});

const appUrl = () => new URL(import.meta.env.BASE_URL, location.origin).href;

async function render() {
  const s = settings.get();
  const total = matMinutes(app.get().events, Date.now());
  const st = await storageStatus();
  const opt = <T extends string | number>(v: T, label: string, cur: T) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  dialog().innerHTML = `${sheetHead('settings-title', 'Settings')}<div class="sheet-body"><form data-settings novalidate>
    <label class="field"><span class="field-label">Your name (optional, for exports)</span><input type="text" name="name" value="${esc(s.name)}" maxlength="60" autocomplete="off" /></label>
    <div class="row">
      <label class="field"><span class="field-label">Started at belt</span><select name="startBelt">${BELTS.map((b) => opt<Belt>(b, BELT_LABEL[b], s.startBelt)).join('')}</select></label>
      <label class="field"><span class="field-label">Stripes</span><select name="startStripes">${[0, 1, 2, 3, 4].map((n) => opt(n, String(n), s.startStripes)).join('')}</select></label>
    </div>
    <p class="hint">Your rank before your first logged promotion. Log promotions in Progress.</p>
    <div class="row">
      <label class="field"><span class="field-label">Theme</span><select name="theme">${opt('auto', 'Auto (follows system)', s.theme)}${opt('gi', 'Gi (light)', s.theme)}${opt('nogi', 'No-gi (dark)', s.theme)}</select></label>
      <label class="field"><span class="field-label">Class length</span><select name="defaultMin">${[30, 45, 60, 75, 90, 120].map((m) => opt(m, m % 60 ? `${m >= 60 ? `${Math.floor(m / 60)}h ` : ''}${m % 60} min` : `${m / 60} hour${m === 60 ? '' : 's'}`, s.defaultMin)).join('')}</select></label>
    </div>
    <label class="check"><input type="checkbox" name="classOnHour" ${s.classOnHour ? 'checked' : ''} /> Classes start on the hour</label>
    <p class="hint" style="margin-top:2px">Class length is used when you log one you already did. Starting on the hour moves a class logged afterwards to the hour, and a tap within 10 minutes after the hour back to it; the toast always offers the exact time.</p>
    <label class="field"><span class="field-label">Reflection prompt</span><select name="reflectAfter">${opt(0, 'Right after a session', s.reflectAfter)}${opt(60, 'An hour after', s.reflectAfter)}${opt(120, 'Two hours after', s.reflectAfter)}${opt(240, 'Four hours after (the evening)', s.reflectAfter)}${opt(-1, 'Off', s.reflectAfter)}</select></label>
    ${canNotify() ? `<label class="check"><input type="checkbox" data-reflect-notify ${s.reflectNotify && Notification.permission === 'granted' ? 'checked' : ''} /> Also send a notification</label>
    <p class="hint" style="margin-top:2px">Only while matlog is open in a tab or window, so it suits a laptop. Phones pause the app once you switch away; the prompt waits on the home screen.</p>` : ''}
    <div class="row">
      <label class="field"><span class="field-label">Week starts</span><select name="weekStart">${opt(1, 'Monday', s.weekStart)}${opt(0, 'Sunday', s.weekStart)}</select></label>
      <label class="field"><span class="field-label">Clock</span><select name="clock">${opt('auto', 'Auto', s.clock)}${opt('12h', '12-hour', s.clock)}${opt('24h', '24-hour', s.clock)}</select></label>
    </div>
    <label class="field"><span class="field-label">Training buddy</span><select name="companion">${(Object.keys(BUDDIES) as BuddyId[]).map((id) => opt(id, BUDDIES[id].label, s.companion)).join('')}${opt('random', 'A different one each day', s.companion)}${opt('off', 'Off', s.companion)}</select></label>
    <label class="check"><input type="checkbox" name="splash" ${s.splash ? 'checked' : ''} /> Show the belt splash when the app opens</label>
  </form>

  <section class="block"><h3>Buttons</h3>
    <p class="basis">Which cards show on the home screen. Hidden ones still work from links, keys and the API, and show while running.</p>
    <div class="picks">${KINDS.map((k) => `<label class="pick check-pick"><input type="checkbox" data-card-toggle="${k.id}" ${s.hiddenCards.includes(k.id) ? '' : 'checked'} /> ${k.emoji} ${k.label}</label>`).join('')}</div>
    <label class="check"><input type="checkbox" data-cards-past ${s.cardsLogPast ? 'checked' : ''} /> Cards log past sessions only (no timers)</label>
    <p class="hint" style="margin-top:2px">A tap opens one you already did, to fill in its time and details. Anything already running still stops with a tap. The round clock, links and the API still time things.</p>
  </section>

  ${
    isStandalone()
      ? ''
      : `<section class="block"><h3>Install the app</h3>
    <p class="basis">Installed, matlog opens full screen, works offline and keeps its data safer (iPhone clears data for sites you don’t visit for a while).</p>
    <ul class="plain">${/Android/.test(navigator.userAgent) ? '<li><b>Android (Chrome):</b> ⋮ menu → Add to Home screen (or Install app).</li><li><b>iPhone / iPad (Safari):</b> Share → Add to Home Screen.</li>' : '<li><b>iPhone / iPad (Safari):</b> Share → Add to Home Screen. No Share button? Tap ⋯ first.</li><li><b>Android (Chrome):</b> ⋮ menu → Add to Home screen (or Install app).</li>'}</ul>
    ${installPrompt ? '<p><button type="button" class="chip primary" data-install>Install</button></p>' : ''}
    <p class="hint">On iPhone the installed app starts with its own empty log: Back up now here, then Import backup in the installed app.</p>
  </section>`
  }

  <section class="block"><h3>Patches to wear</h3>
    <p class="basis">${hours(total)} on the mat so far. Pick which earned patches your buddy wears (up to four show).</p>
    <div class="patches">${PATCHES.map((p) => {
      const got = total >= p.hours * 60;
      return `<label class="patch ${got ? '' : 'locked'}">${patchSvg(p.color, String(p.hours))}<span><input type="checkbox" data-patch="${p.id}" ${s.patches.includes(p.id) ? 'checked' : ''} ${got ? '' : 'disabled'} /> ${p.label}</span></label>`;
    }).join('')}</div>
  </section>

  <section class="block"><h3>Shortcuts and Siri</h3>
    <p class="basis">Opening one of these links logs something, with the usual Undo. On iPhone: Shortcuts → New Shortcut → Open URLs. Links open in Safari, which keeps its own copy of your data, separate from the Home Screen app.</p>
    <div class="links">${LINKS.map(([label, q]) => `<div class="link-row"><span>${esc(label)}<br /><code>${esc(appUrl() + q)}</code></span><button type="button" class="chip" data-copy-link="${esc(q)}">Copy</button></div>`).join('')}</div>
  </section>

  <section class="block"><h3>Backup and other devices</h3>
    <p class="basis">Everything lives in this browser (IndexedDB, with a second copy in localStorage). ${st.persisted ? 'Storage is marked persistent.' : 'Install the app to the Home Screen so the browser keeps it.'} ${s.lastBackupAt ? `Last backup: ${new Date(s.lastBackupAt).toLocaleDateString()}.` : 'No backup yet.'}</p>
    <label class="field" style="margin-top:4px"><span class="field-label">Remind me to back up</span><select data-backup-every>${BACKUP_DAY_CHOICES.map((d) => `<option value="${d}" ${d === s.backupEveryDays ? 'selected' : ''}>${d ? `Every ${d} days` : `Only every ${BACKUP_EVERY} new entries`}</option>`).join('')}</select></label>
    <div class="head-actions"><button type="button" class="chip primary" data-export>Back up now</button><label class="chip" style="cursor:pointer">Import backup<input type="file" accept="application/json,.json,text/plain,.txt" data-import hidden /></label></div>
    <p class="hint" style="margin-top:8px">Importing merges: entries match by id, the newest edit wins, and importing twice is harmless.</p>
  </section>

  <section class="block"><h3>Tips</h3><p><button type="button" class="chip" data-tips-again>Show tips again</button></p></section>

  <section class="block"><h3>For AI agents and scripts</h3>
    <p class="basis">Drive the page with <code>window.matlog</code> (try <code>matlog.help()</code> in the console). The reference is <a href="./llms.txt" target="_blank" rel="noopener">llms.txt</a>.</p>
  </section>
  </div>`;
}

export function openSettings() {
  void render().then(() => openDialog(dialog()));
  const d = dialog();
  if (d.dataset.settingsWired) return;
  d.dataset.settingsWired = '1';
  d.addEventListener('change', async (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.patch) {
      const id = el.dataset.patch as (typeof PATCHES)[number]['id'];
      const cur = settings.get().patches.filter((p) => p !== id);
      settings.set({ patches: el.checked ? [...cur, id] : cur });
      return;
    }
    if (el.dataset.cardToggle) {
      const id = el.dataset.cardToggle;
      const hidden = settings.get().hiddenCards.filter((x) => x !== id);
      const next = el.checked ? hidden : [...hidden, id];
      if (next.length >= KINDS.length) {
        el.checked = true;
        toast('At least one button stays.');
        return;
      }
      settings.set({ hiddenCards: next });
      return;
    }
    if (el.dataset.reflectNotify !== undefined) {
      const on = el.checked && (await askToNotify());
      if (el.checked && !on) {
        el.checked = false;
        toast('Notifications are blocked for matlog. Allow them in the browser’s site settings, then try again.');
      }
      settings.set({ reflectNotify: on });
      return;
    }
    if (el.dataset.cardsPast !== undefined) {
      settings.set({ cardsLogPast: el.checked });
      return;
    }
    if (el.dataset.backupEvery !== undefined) {
      settings.set({ backupEveryDays: Number(el.value), backupLaterAt: 0 });
      return;
    }
    if (el.dataset.import !== undefined) {
      const file = el.files?.[0];
      if (!file) return;
      try {
        const data = parseBackup(await file.text());
        const r = await importData(data);
        // The file's name fills in a blank one here; a name already set is kept.
        if (data.name && !settings.get().name.trim()) settings.set({ name: data.name });
        toast(`Merged: ${r.added} new, ${r.updated} updated${data.skipped ? `, ${data.skipped} skipped` : ''}`);
      } catch (err) {
        toast(err instanceof BackupError ? err.message : "Couldn't read that file.");
      }
      el.value = '';
      return;
    }
    const form = el.closest<HTMLFormElement>('[data-settings]');
    if (!form) return;
    const f = new FormData(form);
    settings.set({
      name: String(f.get('name') ?? '').trim(),
      startBelt: f.get('startBelt') as Belt,
      startStripes: Number(f.get('startStripes')),
      theme: f.get('theme') as 'auto' | 'gi' | 'nogi',
      defaultMin: Number(f.get('defaultMin')),
      weekStart: Number(f.get('weekStart')) as 0 | 1,
      clock: f.get('clock') as 'auto' | '12h' | '24h',
      companion: f.get('companion') as CompanionChoice,
      classOnHour: f.get('classOnHour') === 'on',
      reflectAfter: Number(f.get('reflectAfter')) as ReflectAfter,
      splash: f.get('splash') === 'on',
    });
  });
  d.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    const q = el.closest<HTMLElement>('[data-copy-link]')?.dataset.copyLink;
    if (q) {
      toast((await copyText(appUrl() + q)) ? 'Link copied' : "Couldn't copy");
      return;
    }
    if (el.closest('[data-export]')) await backUpNow().then(() => render());
    if (el.closest('[data-tips-again]')) {
      settings.set({ tipsSeen: [] });
      toast('Tips will show again on the home screen');
    }
    if (el.closest('[data-install]') && installPrompt) {
      await installPrompt.prompt();
      installPrompt = null;
      void render();
    }
  });
}
