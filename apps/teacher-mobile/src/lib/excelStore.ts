import * as SQLite from "expo-sqlite";
import { packageKey } from "../shared/teacherExchange";
import type { ExcelWorkspaceData } from "../shared/exchangeWorkspace";

// File exchanges are independent of cloud users, caches and mutation queues.
const db = SQLite.openDatabaseSync("sekoly-teacher-excel.sqlite");
db.execSync(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS preferences (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);

export const excelStore = {
  read(id: string): ExcelWorkspaceData | null {
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM workspaces WHERE id = ?",
      [id],
    );
    return row ? (JSON.parse(row.value) as ExcelWorkspaceData) : null;
  },
  last(): ExcelWorkspaceData | null {
    const id = db.getFirstSync<{ value: string }>(
      "SELECT value FROM preferences WHERE id = 'active'",
    )?.value;
    return id ? this.read(id) : null;
  },
  list(): ExcelWorkspaceData[] {
    return db
      .getAllSync<{
        value: string;
      }>("SELECT value FROM workspaces ORDER BY updated_at DESC")
      .map((row) => JSON.parse(row.value) as ExcelWorkspaceData);
  },
  save(data: ExcelWorkspaceData): void {
    db.withTransactionSync(() => {
      db.runSync(
        "INSERT INTO workspaces(id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [
          packageKey(data.package),
          JSON.stringify(data),
          new Date().toISOString(),
        ],
      );
      db.runSync(
        "INSERT INTO preferences(id, value) VALUES ('active', ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value",
        [packageKey(data.package)],
      );
    });
  },
  fileMode(): boolean {
    return (
      db.getFirstSync<{ value: string }>(
        "SELECT value FROM preferences WHERE id = 'file-mode'",
      )?.value === "true"
    );
  },
  setFileMode(value: boolean) {
    db.runSync(
      "INSERT INTO preferences(id, value) VALUES ('file-mode', ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value",
      [String(value)],
    );
  },
};
