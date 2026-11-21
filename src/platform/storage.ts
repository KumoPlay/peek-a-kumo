import { openSave, SaveError, toSaveFile, type SaveFile, type SaveState } from '../core';

/**
 * Where progress is kept: the browser's own storage on this device. No server.
 *
 *  - IndexedDB holds the save ('main') and a copy of the last save that loaded
 *    fine ('backup').
 *  - localStorage holds a mirror of the newest save. It is written in one go,
 *    so it still works in the last moment before a tab closes, and it is the
 *    fallback where IndexedDB is not available.
 *
 * On load, every copy is checked and the newest good one wins.
 */
const DB_NAME = 'peek-a-kumo';
const STORE = 'saves';
const MAIN = 'main';
const BACKUP = 'backup';
const MIRROR_KEY = 'peek-a-kumo.save';
const OPEN_TIMEOUT_MS = 4000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    // Some browsers never answer in private mode; do not wait forever.
    const timer = setTimeout(() => reject(new Error('IndexedDB did not open')), OPEN_TIMEOUT_MS);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error('IndexedDB failed to open'));
    };
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write was stopped'));
  });
}

const dbGet = (key: string): Promise<unknown> => withStore('readonly', (store) => store.get(key));
const dbPut = (key: string, value: unknown): Promise<unknown> => withStore('readwrite', (store) => store.put(value, key));
const dbDelete = (key: string): Promise<unknown> => withStore('readwrite', (store) => store.delete(key));

function readMirror(): unknown {
  try {
    const text = localStorage.getItem(MIRROR_KEY);
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function writeMirror(file: SaveFile): boolean {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export type LoadResult =
  | { status: 'new' }
  | { status: 'loaded'; state: SaveState; rev: number }
  | { status: 'unreadable'; reason: 'corrupt' | 'too-new' };

/** Finds the newest good save on this device. */
export async function loadGame(): Promise<LoadResult> {
  const [main, backup] = await Promise.all([
    dbGet(MAIN).catch(() => null),
    dbGet(BACKUP).catch(() => null),
  ]);
  const copies = [main, readMirror(), backup].filter((copy) => copy !== null && copy !== undefined);

  let best: { state: SaveState; rev: number; raw: unknown } | null = null;
  let tooNew = false;
  for (const raw of copies) {
    try {
      const opened = openSave(raw);
      if (!best || opened.rev > best.rev) best = { ...opened, raw };
    } catch (error) {
      if (error instanceof SaveError && error.code === 'too-new') tooNew = true;
    }
  }

  // A save from a newer game must never be replaced by an older copy.
  if (tooNew) return { status: 'unreadable', reason: 'too-new' };
  if (best) {
    void dbPut(BACKUP, best.raw).catch(() => undefined);
    return { status: 'loaded', state: best.state, rev: best.rev };
  }
  return copies.length === 0 ? { status: 'new' } : { status: 'unreadable', reason: 'corrupt' };
}

let waiting: SaveFile | null = null;
let writing = false;
let mirrorWorks = true;
let dbWorks = true;

async function writeWaiting(): Promise<void> {
  if (writing) return;
  writing = true;
  while (waiting) {
    const file = waiting;
    waiting = null;
    try {
      await dbPut(MAIN, file);
      dbWorks = true;
    } catch {
      dbWorks = false;
    }
  }
  writing = false;
}

/** Saves progress. Quick to call; the newest save always wins. */
export function saveGame(state: SaveState, rev: number): void {
  const file = toSaveFile(state, rev);
  mirrorWorks = writeMirror(file);
  waiting = file;
  void writeWaiting();
}

/** False when neither kind of storage accepted the last save. */
export function isSavingWorking(): boolean {
  return mirrorWorks || dbWorks;
}

/** Removes every copy of the save from this device. */
export async function eraseGame(): Promise<void> {
  waiting = null;
  try {
    localStorage.removeItem(MIRROR_KEY);
  } catch {
    // Nothing to remove.
  }
  await Promise.all([dbDelete(MAIN).catch(() => undefined), dbDelete(BACKUP).catch(() => undefined)]);
}

/**
 * Asks the browser to keep this site's storage even when the device runs low
 * on space. Browsers may say no; the game works either way.
 */
export async function askToKeepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
