/**
 * What this app keeps in the browser for its address, and forgetting it («Вимкнути повністю»
 * with «стерти дані браузера», 0.7.1): localStorage (settings, running order, selection, panel
 * places …), Cache Storage (library segments) and IndexedDB (the PGlite snapshot). It lives in
 * the browser profile, per address (http://localhost:4747 and http://localhost:5173 are two),
 * and stays after the app's folder is deleted.
 */

const FORGET = 'vo-forget';

/** Roughly how much this address keeps, in bytes (null: the browser doesn't say). */
export async function browserDataBytes(): Promise<number | null> {
  let local = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      local += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2; // UTF-16
    }
  } catch {
    /* storage blocked */
  }
  try {
    // Cache Storage + IndexedDB (localStorage isn't counted there)
    const usage = (await navigator.storage?.estimate?.())?.usage;
    if (usage != null) return usage + local;
  } catch {
    /* not supported */
  }
  return local || null;
}

/** This page writes nothing more: its stores would put the settings back on any change. */
function stopPersisting(): void {
  try {
    Storage.prototype.setItem = () => undefined;
  } catch {
    /* locked down */
  }
}

/**
 * Forget everything this address keeps. The other windows of the address (the control window,
 * a settings window) are told to stop writing too — or their stores would re-save at once.
 */
export async function clearBrowserData(): Promise<void> {
  try {
    const bc = new BroadcastChannel(FORGET);
    bc.postMessage('forget');
    bc.close();
  } catch {
    /* no channel: this window only */
  }
  stopPersisting();
  const wipe = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* storage blocked */
    }
  };
  wipe();
  try {
    for (const k of await caches.keys()) await caches.delete(k);
  } catch {
    /* no Cache Storage (plain http on another host) */
  }
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise<void>((resolve) => {
            if (!d.name) return resolve();
            // an open connection (the PGlite worker) only delays it until the page closes
            const r = indexedDB.deleteDatabase(d.name);
            r.onsuccess = r.onerror = r.onblocked = () => resolve();
          }),
      ),
    );
  } catch {
    /* no IndexedDB */
  }
  // a write another window made before it heard us
  setTimeout(wipe, 500);
}

/** Every window of the app listens (main.tsx): when one forgets, the others stop writing. */
export function listenForForget(): void {
  try {
    new BroadcastChannel(FORGET).onmessage = () => stopPersisting();
  } catch {
    /* no channel */
  }
}
