import './ui/style.css';
import './ui/casino.css';
import { boot } from './game';
import { installScrollGuard } from './input/scrollguard';

// iOS Safari ignores user-scalable=no: block page pinch zoom and
// rubber-band scrolling so gestures always belong to the game.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
installScrollGuard();

/** A failed start after an update is almost always a stale offline cache: clear it and reload, once. */
async function heal(): Promise<boolean> {
  try {
    if (sessionStorage.getItem('pf-healed')) return false;
    sessionStorage.setItem('pf-healed', '1');
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.filter((k) => k.startsWith('pokerforge-')).map((k) => caches.delete(k)));
    location.reload();
    return true;
  } catch {
    return false;
  }
}

boot().then(() => { try { sessionStorage.removeItem('pf-healed'); } catch { /* private mode */ } }).catch(async (e) => {
  console.error(e);
  if (await heal()) return;
  const el = document.getElementById('boot');
  if (el) el.innerHTML = `<div class="boot-title">Something went wrong</div><pre class="boot-err">${String(e?.message ?? e)}</pre>`;
});
