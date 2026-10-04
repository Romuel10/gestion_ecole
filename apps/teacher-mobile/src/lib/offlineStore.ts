import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('sekoly-teacher.sqlite');

db.execSync(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mutation_queue (
    id TEXT PRIMARY KEY NOT NULL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload TEXT NOT NULL,
    conflict_target TEXT,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
`);

const queueColumns = db.getAllSync<{ name: string }>('PRAGMA table_info(mutation_queue)');
if (!queueColumns.some(column => column.name === 'owner_id')) db.execSync('ALTER TABLE mutation_queue ADD COLUMN owner_id TEXT;');
if (!queueColumns.some(column => column.name === 'school_id')) db.execSync('ALTER TABLE mutation_queue ADD COLUMN school_id TEXT;');
// Legacy mutations cannot be attributed safely. Keep them for recovery, never
// replay them under the account that happens to sign in next.
let ownerId: string | null = null;
let schoolId: string | null = null;
const globalKeys = new Set(['device-id-v1', 'text-scale', 'theme-mode']);
const cacheKey = (key: string) => globalKeys.has(key) ? key : ownerId ? `user:${ownerId}:${key}` : null;

export type QueuedMutation = {
  owner_id: string | null;
  school_id: string | null;
  id: string;
  table_name: string;
  operation: 'upsert' | 'insert' | 'update' | 'delete';
  payload: string;
  conflict_target: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
};

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const normalized = char === 'x' ? value : (value & 0x3) | 0x8;
    return normalized.toString(16);
  });

export const offlineStore = {
  setOwner(userId: string | null, activeSchoolId: string | null = null) {
    if (ownerId !== userId) schoolId = null;
    ownerId = userId;
    if (activeSchoolId) schoolId = activeSchoolId;
  },
  currentOwner() { return ownerId; },
  isOwner(userId: string, activeSchoolId?: string) { return ownerId === userId && (!activeSchoolId || schoolId === activeSchoolId); },
  revokeAccess(expectedOwner?: string) {
    if (expectedOwner && ownerId !== expectedOwner) return;
    if (ownerId) db.runSync('DELETE FROM cache WHERE key LIKE ?', [`user:${ownerId}:%`]);
    ownerId = null; schoolId = null;
  },
  legacyQueueCount() {
    return db.getFirstSync<{total:number}>('SELECT COUNT(*) AS total FROM mutation_queue WHERE owner_id IS NULL')?.total ?? 0;
  },
  setCache(key: string, value: unknown, expectedOwner = ownerId) {
    if (!globalKeys.has(key) && expectedOwner !== ownerId) throw new Error('Le compte a changé pendant le chargement.');
    const scopedKey = cacheKey(key);
    if (!scopedKey) throw new Error('Session hors ligne verrouillée.');
    db.runSync(
      `INSERT INTO cache(key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      [scopedKey, JSON.stringify(value), new Date().toISOString()]
    );
  },

  getCache<T>(key: string, expectedOwner = ownerId): T | null {
    if (!globalKeys.has(key) && expectedOwner !== ownerId) return null;
    const scopedKey = cacheKey(key);
    if (!scopedKey) return null;
    const row = db.getFirstSync<{ value: string }>(
      'SELECT value FROM cache WHERE key = ?',
      [scopedKey]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  },

  enqueue(
    tableName: string,
    operation: QueuedMutation['operation'],
    payload: unknown,
    conflictTarget?: string,
    expectedOwner = ownerId
  ) {
    if (expectedOwner !== ownerId) throw new Error('Le compte a changé pendant l’enregistrement.');
    if (!ownerId || !schoolId) throw new Error('Compte et établissement vérifiés requis.');
    const rows = Array.isArray(payload) ? payload : [payload];
    if (rows.some(row => row?.school_id !== schoolId)) throw new Error('Opération hors ligne d’un autre établissement.');
    const id = uuid();
    db.runSync(
      `INSERT INTO mutation_queue
       (id, table_name, operation, payload, conflict_target, created_at, owner_id, school_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tableName,
        operation,
        JSON.stringify(payload),
        conflictTarget ?? null,
        new Date().toISOString(),
        ownerId,
        schoolId,
      ]
    );
    return id;
  },

  listQueue(): QueuedMutation[] {
    return db.getAllSync<QueuedMutation>(
      'SELECT * FROM mutation_queue WHERE owner_id = ? AND school_id = ? ORDER BY created_at ASC',
      [ownerId, schoolId]
    );
  },

  markFailed(id: string, error: string) {
    db.runSync(
      `UPDATE mutation_queue
       SET attempts = attempts + 1, last_error = ?
       WHERE id = ? AND owner_id = ? AND school_id = ?`,
      [error.slice(0, 1000), id, ownerId, schoolId]
    );
  },

  remove(id: string) {
    db.runSync('DELETE FROM mutation_queue WHERE id = ? AND owner_id = ? AND school_id = ?', [id, ownerId, schoolId]);
  },

  queueCount() {
    const row = db.getFirstSync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM mutation_queue WHERE owner_id = ? AND school_id = ?',
      [ownerId, schoolId]
    );
    return row?.total ?? 0;
  },

  retryFailures() {
    db.runSync('UPDATE mutation_queue SET attempts = 0, last_error = NULL WHERE owner_id = ? AND school_id = ?', [ownerId, schoolId]);
  },

  queueHealth() {
    const row = db.getFirstSync<{
      total: number;
      failed: number;
      blocked: number;
      last_error: string | null;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN attempts >= 5 THEN 1 ELSE 0 END) AS blocked,
         (
           SELECT last_error
           FROM mutation_queue
           WHERE last_error IS NOT NULL AND owner_id = ? AND school_id = ?
           ORDER BY created_at DESC
           LIMIT 1
         ) AS last_error
       FROM mutation_queue WHERE owner_id = ? AND school_id = ?`,
      [ownerId, schoolId, ownerId, schoolId]
    );

    return {
      total: row?.total ?? 0,
      failed: row?.failed ?? 0,
      blocked: row?.blocked ?? 0,
      lastError: row?.last_error ?? null,
    };
  },

  deviceId() {
    const key = 'device-id-v1';
    const existing = this.getCache<string>(key);
    if (existing) return existing;

    const id = uuid();
    this.setCache(key, id);
    return id;
  },
};
