import { BELTS, type Belt, type CompanionChoice } from '../core/types';
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

const dialog = () => document.getElementById('settings') as HTMLDialogElement;

/** Ready-made links for Shortcuts, Siri and bookmarks. */
export const LINKS: [string, string][] = [
  ['Start or stop class', '?do=toggle&type=class'],
  ['Log a 60 minute open mat', '?do=log&type=open-mat&min=60'],
  ['Log a 90 minute no-gi class', '?do=log&type=class&min=90&gi=nogi'],
  ['Start or stop a round', '?do=toggle&type=roll'],
  ['Log a 45 minute drilling session, 30 minutes ago', '?do=log&type=drilling&min=45&ago=30'],
];

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
      <label class="field"><span class="field-label">Session length</span><select name="defaultMin">${[30, 45, 60, 75, 90, 120].map((m) => opt(m, `${m} min`, s.defaultMin)).join('')}</select></label>
    </div>
    <div class="row">
      <label class="field"><span class="field-label">Week starts</span><select name="weekStart">${opt(1, 'Monday', s.weekStart)}${opt(0, 'Sunday', s.weekStart)}</select></label>
      <label class="field"><span class="field-label">Clock</span><select name="clock">${opt('auto', 'Auto', s.clock)}${opt('12h', '12-hour', s.clock)}${opt('24h', '24-hour', s.clock)}</select></label>
    </div>
    <label class="field"><span class="field-label">Training buddy</span><select name="companion">${(Object.keys(BUDDIES) as BuddyId[]).map((id) => opt(id, BUDDIES[id].label, s.companion)).join('')}${opt('random', 'A different one each day', s.companion)}${opt('off', 'Off', s.companion)}</select></label>
    <label class="check"><input type="checkbox" name="splash" ${s.splash ? 'checked' : ''} /> Show the belt splash when the app opens</label>
  </form>

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
    <div class="head-actions"><button type="button" class="chip primary" data-export>Back up now</button><label class="chip" style="cursor:pointer">Import backup<input type="file" accept="application/json,.json" data-import hidden /></label></div>
    <p class="hint" style="margin-top:8px">Importing merges: entries match by id, the newest edit wins, and importing twice is harmless.</p>
  </section>

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
  });
}
