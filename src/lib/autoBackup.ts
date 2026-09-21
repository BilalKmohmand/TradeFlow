/**
 * Automatic daily backups kept on this device (IndexedDB), newest 14 kept. The "Download backup"
 * button stays the way to get a copy off the device; its last use is remembered so the app can
 * remind the owner when no backup has been downloaded for a week.
 */
export interface AutoBackupMeta {
  id: string;
  /** Day the backup is for (YYYY-MM-DD); one automatic backup per day. */
  date: string;
  createdAt: string;
  size: number;
  /** 'auto' = made by the daily schedule, 'manual' = "Back up now". */
  kind: 'auto' | 'manual';
  counts?: Record<string, number>;
}

export interface AutoBackupRecord extends AutoBackupMeta {
  json: string;
}

export interface BackupStore {
  list: () => Promise<AutoBackupMeta[]>;
  get: (id: string) => Promise<AutoBackupRecord | null>;
  put: (rec: AutoBackupRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const KEEP_AUTO_BACKUPS = 14;
export const REMIND_AFTER_DAYS = 7;
export const LAST_DOWNLOAD_KEY = 'sarmaya_last_backup_download_v1';

const DB_NAME = 'sarmaya_backups';
const STORE = 'backups';

/** Newest first: by day, then by the moment it was made. */
const newestFirst = (a: AutoBackupMeta, b: AutoBackupMeta) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

const meta = (r: AutoBackupRecord): AutoBackupMeta => {
  const { json, ...rest } = r;
  void json;
  return rest;
};

/** In-memory store (tests, and browsers without IndexedDB). */
export const memoryBackupStore = (): BackupStore => {
  const rows = new Map<string, AutoBackupRecord>();
  return {
    list: async () => Array.from(rows.values()).map(meta).sort(newestFirst),
    get: async (id) => rows.get(id) || null,
    put: async (rec) => { rows.set(rec.id, rec); },
    remove: async (id) => { rows.delete(id); },
  };
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? (req as IDBRequest<T>).result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
};

export const indexedDbBackupStore = (): BackupStore => ({
  list: async () => {
    const all = ((await tx<AutoBackupRecord[]>('readonly', (s) => s.getAll())) || []) as AutoBackupRecord[];
    return all.map(meta).sort(newestFirst);
  },
  get: async (id) => ((await tx<AutoBackupRecord>('readonly', (s) => s.get(id))) as AutoBackupRecord) || null,
  put: async (rec) => { await tx('readwrite', (s) => s.put(rec)); },
  remove: async (id) => { await tx('readwrite', (s) => s.delete(id)); },
});

let defaultStore: BackupStore | null = null;
/** IndexedDB when the browser has it, otherwise memory (the backups then last until the page closes). */
export const getBackupStore = (): BackupStore => {
  if (!defaultStore) defaultStore = typeof indexedDB !== 'undefined' && indexedDB ? indexedDbBackupStore() : memoryBackupStore();
  return defaultStore;
};
/** Tests swap the store. */
export const setBackupStore = (s: BackupStore | null) => { defaultStore = s; };

const countsOf = (json: string): Record<string, number> => {
  try {
    const d = JSON.parse(json);
    const out: Record<string, number> = {};
    ['invoices', 'customers', 'suppliers', 'products', 'expenses', 'ledger'].forEach((k) => { if (Array.isArray(d[k])) out[k] = d[k].length; });
    return out;
  } catch {
    return {};
  }
};

/** Save a backup and keep only the newest 14 automatic ones. */
export const saveBackup = async (store: BackupStore, json: string, date: string, kind: 'auto' | 'manual' = 'auto'): Promise<AutoBackupMeta> => {
  const rec: AutoBackupRecord = { id: `bk-${date}-${Date.now().toString(36)}`, date, createdAt: new Date().toISOString(), size: json.length, kind, counts: countsOf(json), json };
  await store.put(rec);
  const all = await store.list();
  const autos = all.filter((b) => b.kind === 'auto');
  const extra = [...autos.slice(KEEP_AUTO_BACKUPS), ...all.filter((b) => b.kind === 'manual').slice(KEEP_AUTO_BACKUPS)];
  for (const b of extra) await store.remove(b.id);
  return meta(rec);
};

/** Make today's automatic backup unless there already is one. Returns it when one was made. */
export const runDailyBackup = async (store: BackupStore, build: () => string, today: string): Promise<AutoBackupMeta | null> => {
  const all = await store.list();
  if (all.some((b) => b.kind === 'auto' && b.date === today)) return null;
  return saveBackup(store, build(), today, 'auto');
};

export const lastDownloadAt = (): string | null => {
  try {
    return localStorage.getItem(LAST_DOWNLOAD_KEY);
  } catch {
    return null;
  }
};

export const markDownloaded = (when = new Date().toISOString()) => {
  try {
    localStorage.setItem(LAST_DOWNLOAD_KEY, when);
  } catch {
    /* storage full or blocked: the reminder simply shows again */
  }
};

/** True when no backup has been downloaded for 7 days (or ever). */
export const backupReminderDue = (last: string | null, now = new Date()): boolean => {
  if (!last) return true;
  const t = new Date(last).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > REMIND_AFTER_DAYS * 86_400_000;
};
