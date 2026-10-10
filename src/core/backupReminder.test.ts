import { describe, expect, it } from 'vitest';
import { BACKUP_EVERY, backupStatus } from './backupReminder';
import { ev } from './testUtil';

const DAY = 86_400_000;
const now = 100 * DAY;
const base = { lastBackupAt: null, backupSnoozedAt: 0, backupLaterAt: 0, backupEveryDays: 7 };
const many = (n: number, at = now - 10 * DAY) => Array.from({ length: n }, (_, i) => ev('class', at + i));

describe('backupStatus', () => {
  it('stays quiet for a new log', () => {
    expect(backupStatus(many(3, now - DAY), base, now).reason).toBeNull();
  });
  it('reminds after the interval when there is something new', () => {
    expect(backupStatus(many(6), base, now)).toEqual({ newSince: 6, reason: 'time', days: null });
    expect(backupStatus(many(6), { ...base, lastBackupAt: now - 8 * DAY }, now).reason).toBeNull(); // nothing new since
    const after = [...many(6), ev('class', now - DAY, undefined, { createdAt: now - DAY })];
    expect(backupStatus(after, { ...base, lastBackupAt: now - 8 * DAY }, now)).toEqual({ newSince: 1, reason: 'time', days: 8 });
    expect(backupStatus(after, { ...base, lastBackupAt: now - 3 * DAY }, now).reason).toBeNull();
  });
  it('"Not now" waits a day; 0 days turns the time reminder off', () => {
    expect(backupStatus(many(6), { ...base, backupLaterAt: now - 3_600_000 }, now).reason).toBeNull();
    expect(backupStatus(many(6), { ...base, backupLaterAt: now - 2 * DAY }, now).reason).toBe('time');
    expect(backupStatus(many(6), { ...base, backupEveryDays: 0 }, now).reason).toBeNull();
  });
  it('reminds every 30 new entries, even with the time reminder off; snoozing moves to the next 30', () => {
    const s = { ...base, backupEveryDays: 0 };
    expect(backupStatus(many(BACKUP_EVERY), s, now).reason).toBe('count');
    expect(backupStatus(many(BACKUP_EVERY + 5), { ...s, backupSnoozedAt: BACKUP_EVERY }, now).reason).toBeNull();
    expect(backupStatus(many(2 * BACKUP_EVERY), { ...s, backupSnoozedAt: BACKUP_EVERY }, now).reason).toBe('count');
  });
  it('ignores deleted entries', () => {
    expect(backupStatus(many(BACKUP_EVERY).map((e) => ({ ...e, deleted: true })), base, now).reason).toBeNull();
  });
});
