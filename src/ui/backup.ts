import { backupFilename, toBackup } from '../core/backup';
import { backupStatus } from '../core/backupReminder';
import { plural } from '../core/format';
import { app, settings, snapshot } from '../core/log';
import { download } from './dom';
import { toast } from './toast';

const isTouch = () => matchMedia('(pointer: coarse)').matches || /iPad|iPhone|iPod|Android/.test(navigator.userAgent);

export function markBackedUp(now = Date.now()) {
  settings.set({ lastBackupAt: now, backupSnoozedAt: 0, backupLaterAt: 0 });
}

function exportDownload() {
  const now = Date.now();
  download(backupFilename(now), JSON.stringify(toBackup(snapshot(), now, settings.get().name)));
  markBackedUp(now);
  toast('Backup saved');
}

/**
 * Saves a backup. On a phone it opens the share sheet with the file, so it can go to Files, iCloud
 * Drive or Google Drive (where a phone keeps files); elsewhere, or if sharing isn't possible, a download.
 */
export async function backUpNow() {
  const now = Date.now();
  const json = JSON.stringify(toBackup(snapshot(), now, settings.get().name));
  let file = new File([json], backupFilename(now), { type: 'application/json' });
  // Chrome on Android won't share .json files; the same content as .txt goes through (import takes both).
  if (isTouch() && !navigator.canShare?.({ files: [file] })) file = new File([json], backupFilename(now).replace(/\.json$/, '.txt'), { type: 'text/plain' });
  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'matlog backup', text: 'A matlog backup. To restore: matlog → Settings → Import backup.' });
      markBackedUp(now);
      toast('Backup saved');
      return;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
      toast("Couldn't open the share sheet. Downloading instead.");
    }
  }
  exportDownload();
}

const shortDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** The backup reminder's banner, when it's due (see core/backupReminder.ts). */
export function backupBanner(): string | null {
  const s = settings.get();
  const { newSince, reason, days } = backupStatus(app.get().events, s, Date.now());
  if (!reason) return null;
  const msg =
    reason === 'count'
      ? `💾 <b>${plural(newSince, 'new entry', 'new entries')}</b> ${s.lastBackupAt ? `since your last backup (${shortDate(s.lastBackupAt)})` : 'and no backup yet'}.`
      : days !== null
        ? `💾 <b>${days} days since your last backup.</b> Your log only lives in this browser.`
        : '💾 <b>No backup yet.</b> Your log only lives in this browser; save a copy so nothing gets lost.';
  return `<span>${msg}</span><span class="head-actions"><button type="button" class="chip" data-backup-later>Not now</button><button type="button" class="chip primary" data-backup>Back up now</button></span>`;
}

export function backupLater() {
  const now = Date.now();
  settings.set({ backupSnoozedAt: backupStatus(app.get().events, settings.get(), now).newSince, backupLaterAt: now });
  toast(settings.get().backupEveryDays ? 'OK, tomorrow at the earliest. Change how often in Settings.' : 'OK. Change reminders in Settings.');
}
