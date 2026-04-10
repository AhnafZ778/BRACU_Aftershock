/**
 * offlineDB.ts — IndexedDB-backed offline alert storage
 *
 * Persists CAP alerts locally so mesh-relayed warnings survive
 * page reloads and full offline scenarios.
 */

import type { CAPAlertJSON } from './meshProtocol';

const DB_NAME = 'nirapotta-offline';
const DB_VERSION = 1;
const STORE_ALERTS = 'alerts';
const MAX_STORED = 100;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ALERTS)) {
        db.createObjectStore(STORE_ALERTS, { keyPath: 'identifier' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save a single CAP alert to IndexedDB.
 * Silently drops write failures (best-effort offline cache).
 */
export async function saveAlert(alert: CAPAlertJSON): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_ALERTS, 'readwrite');
    tx.objectStore(STORE_ALERTS).put(alert);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // Best-effort — IndexedDB may be unavailable (private browsing, quota)
  }
}

/**
 * Load all cached alerts, newest first (up to MAX_STORED).
 */
export async function loadAlerts(): Promise<CAPAlertJSON[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_ALERTS, 'readonly');
    const store = tx.objectStore(STORE_ALERTS);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const results = (req.result as CAPAlertJSON[]) || [];
        resolve(results.slice(0, MAX_STORED));
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
