import { registerSW } from 'virtual:pwa-register';
import { toast } from './toast';

/** Registers the service worker (offline + installable). New versions wait for the user: never reload mid-round. */
export function setupPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('A new version of matlog is ready', { duration: 60_000, actions: [{ label: 'Reload', primary: true, run: () => void updateSW(true) }] });
    },
    onOfflineReady() {
      toast('matlog now works offline', { duration: 4000 });
    },
  });
}
