/**
 * Durable key-value storage: IndexedDB first, localStorage as fallback.
 * The world save lives under 'save'; rotating backups under 'backup0..2'.
 */
const DB = 'pokerforge';
const STORE = 'kv';

let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

export async function put(k: string, value: unknown): Promise<boolean> {
  const db = await open();
  if (db) {
    const ok = await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, k);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    if (ok) return true;
  }
  try {
    localStorage.setItem('af:' + k, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function get<T>(k: string): Promise<T | undefined> {
  const db = await open();
  if (db) {
    const v = await new Promise<T | undefined>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(k);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
    if (v !== undefined) return v;
  }
  try {
    const s = localStorage.getItem('af:' + k);
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function del(k: string): Promise<void> {
  const db = await open();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(k);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try { localStorage.removeItem('af:' + k); } catch { /* ignore */ }
}

/** Ask the browser not to evict our data (best effort, silent). */
export async function persist(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
}
