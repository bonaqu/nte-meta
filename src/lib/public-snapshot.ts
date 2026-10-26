import type { SiteData } from '../types';
import {
  publicCacheScope,
  publicCollectionKeys,
  type PublicCollectionKey,
} from './api';

type Snapshot = Partial<Pick<SiteData, PublicCollectionKey>>;
// One row per collection avoids synchronous JSON work and localStorage quotas.
// Account data and credentialed responses are never accepted by this module.
function transact<T>(
  fallback: T,
  action: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    let db: IDBDatabase | undefined;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db?.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), 1500);
    try {
      const open = indexedDB.open('nte-public-snapshot-v1', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('collections');
      open.onerror = open.onblocked = () => finish(fallback);
      open.onsuccess = () => {
        db = open.result;
        if (settled) {
          db.close();
          return;
        }
        const tx = db.transaction('collections', 'readwrite');
        tx.onerror = tx.onabort = () => finish(fallback);
        action(tx.objectStore('collections'), finish);
      };
    } catch {
      finish(fallback);
    }
  });
}

export function readPublicSnapshot() {
  return transact<Snapshot>({}, (store, done) => {
    const result: Snapshot = {};
    let remaining = publicCollectionKeys.length;
    for (const key of publicCollectionKeys) {
      const request = store.get(`${publicCacheScope}:${key}`);
      request.onsuccess = () => {
        const row = request.result as
          | { savedAt?: number; data?: unknown }
          | undefined;
        if (
          row &&
          typeof row.savedAt === 'number' &&
          Array.isArray(row.data) &&
          row.data.every(
            (item: unknown) =>
              item &&
              typeof item === 'object' &&
              'id' in item &&
              typeof item.id === 'string',
          )
        ) {
          Object.assign(result, { [key]: row.data });
        }
        if (--remaining === 0) done(result);
      };
    }
  });
}

export function writePublicSnapshot<K extends PublicCollectionKey>(
  key: K,
  data: SiteData[K],
) {
  return transact(false, (store, done) => {
    store.put({ savedAt: Date.now(), data }, `${publicCacheScope}:${key}`);
    store.transaction.oncomplete = () => done(true);
  });
}
