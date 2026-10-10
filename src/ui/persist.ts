let asked = false;

/** Asks the browser not to evict our storage. Called on the first log of a session; harmless to repeat. */
export function requestPersistence() {
  if (asked) return;
  asked = true;
  void navigator.storage?.persist?.().catch(() => false);
}

export async function storageStatus(): Promise<{ persisted: boolean | null; usage?: number; quota?: number }> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? null;
    const est = await navigator.storage?.estimate?.();
    return { persisted, usage: est?.usage, quota: est?.quota };
  } catch {
    return { persisted: null };
  }
}
