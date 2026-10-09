import { DatabaseSchema } from '../types/school';

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T = unknown>(
          command: string,
          args?: Record<string, unknown>
        ) => Promise<T>;
      };
    };
  }
}

export class DesktopStorageService {
  static isDesktop(): boolean {
    return Boolean(window.__TAURI__?.core?.invoke);
  }

  static async loadDatabase(): Promise<DatabaseSchema | null> {
    if (!this.isDesktop()) return null;
    const raw = await window.__TAURI__!.core!.invoke<string | null>('load_database');
    if (!raw) return null;
    return JSON.parse(raw) as DatabaseSchema;
  }

  static async saveDatabase(db: DatabaseSchema): Promise<void> {
    if (!this.isDesktop()) return;
    await window.__TAURI__!.core!.invoke('save_database', {
      json: JSON.stringify(db),
    });
  }

  static async resetDatabase(): Promise<void> {
    if (!this.isDesktop()) return;
    await window.__TAURI__!.core!.invoke('reset_database');
  }

  static async createRecoveryBackup(db: DatabaseSchema): Promise<string> {
    return window.__TAURI__!.core!.invoke<string>('create_recovery_backup', { json: JSON.stringify(db) });
  }

  static async createDailyBackup(db: DatabaseSchema): Promise<string> {
    return window.__TAURI__!.core!.invoke<string>('create_daily_backup', { json: JSON.stringify(db) });
  }

  static async getDatabasePath(): Promise<string | null> {
    if (!this.isDesktop()) return null;
    return window.__TAURI__!.core!.invoke<string>('database_path');
  }
}
