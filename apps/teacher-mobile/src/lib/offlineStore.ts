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

export type QueuedMutation = {
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
  setCache(key: string, value: unknown) {
    db.runSync(
      `INSERT INTO cache(key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      [key, JSON.stringify(value), new Date().toISOString()]
    );
  },

  getCache<T>(key: string): T | null {
    const row = db.getFirstSync<{ value: string }>(
      'SELECT value FROM cache WHERE key = ?',
      [key]
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
    conflictTarget?: string
  ) {
    const id = uuid();
    db.runSync(
      `INSERT INTO mutation_queue
       (id, table_name, operation, payload, conflict_target, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        tableName,
        operation,
        JSON.stringify(payload),
        conflictTarget ?? null,
        new Date().toISOString(),
      ]
    );
    return id;
  },

  listQueue(): QueuedMutation[] {
    return db.getAllSync<QueuedMutation>(
      'SELECT * FROM mutation_queue ORDER BY created_at ASC'
    );
  },

  markFailed(id: string, error: string) {
    db.runSync(
      `UPDATE mutation_queue
       SET attempts = attempts + 1, last_error = ?
       WHERE id = ?`,
      [error.slice(0, 1000), id]
    );
  },

  remove(id: string) {
    db.runSync('DELETE FROM mutation_queue WHERE id = ?', [id]);
  },

  queueCount() {
    const row = db.getFirstSync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM mutation_queue'
    );
    return row?.total ?? 0;
  },

  queueHealth() {
    const row = db.getFirstSync<{
      total: number;
      failed: number;
      last_error: string | null;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS failed,
         (
           SELECT last_error
           FROM mutation_queue
           WHERE last_error IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 1
         ) AS last_error
       FROM mutation_queue`
    );

    return {
      total: row?.total ?? 0,
      failed: row?.failed ?? 0,
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
