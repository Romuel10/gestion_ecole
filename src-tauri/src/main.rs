#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn database_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Impossible de localiser les données de l'application: {error}"))?;

    fs::create_dir_all(&dir)
        .map_err(|error| format!("Impossible de créer le dossier de données: {error}"))?;

    Ok(dir.join("sekoly.sqlite"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let path = database_file(app)?;
    let connection = Connection::open(path)
        .map_err(|error| format!("Impossible d'ouvrir SQLite: {error}"))?;

    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = FULL;

            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ",
        )
        .map_err(|error| format!("Impossible d'initialiser SQLite: {error}"))?;

    Ok(connection)
}

#[tauri::command]
fn load_database(app: AppHandle) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT json FROM app_state WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Lecture SQLite impossible: {error}"))
}

#[tauri::command]
fn save_database(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|error| format!("Données JSON invalides: {error}"))?;

    let connection = open_database(&app)?;
    connection
        .execute(
            "
            INSERT INTO app_state (id, json, updated_at)
            VALUES (1, ?1, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                json = excluded.json,
                updated_at = CURRENT_TIMESTAMP
            ",
            params![json],
        )
        .map_err(|error| format!("Écriture SQLite impossible: {error}"))?;

    Ok(())
}

#[tauri::command]
fn reset_database(app: AppHandle) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM app_state WHERE id = 1", [])
        .map_err(|error| format!("Réinitialisation SQLite impossible: {error}"))?;
    Ok(())
}

#[tauri::command]
fn database_path(app: AppHandle) -> Result<String, String> {
    Ok(database_file(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn create_recovery_backup(app: AppHandle, json: String) -> Result<String, String> {
    let parent = database_file(&app)?.parent().ok_or("Dossier de données introuvable")?.join("backups");
    write_backup(&parent, &json, "SEKOLY_RECOVERY")
}

fn write_backup(parent: &std::path::Path, json: &str, prefix: &str) -> Result<String, String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|error| format!("Sauvegarde JSON invalide: {error}"))?;
    fs::create_dir_all(&parent).map_err(|error| format!("Sauvegarde impossible: {error}"))?;
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?.as_nanos();
    let file_path = parent.join(format!("{prefix}_{timestamp}.json"));
    let temporary_path = parent.join(format!("{prefix}_{timestamp}.json.tmp"));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary_path)
        .map_err(|error| format!("Sauvegarde impossible: {error}"))?;
    let result = file.write_all(json.as_bytes()).and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = result.and_then(|_| fs::rename(&temporary_path, &file_path)) {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Sauvegarde impossible: {error}"));
    }
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_daily_backup(app: AppHandle, json: String) -> Result<String, String> {
    let parent = database_file(&app)?.parent().ok_or("Dossier de données introuvable")?.join("backups");
    fs::create_dir_all(&parent).map_err(|error| error.to_string())?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
    for entry in fs::read_dir(&parent).map_err(|error| error.to_string())?.filter_map(Result::ok) {
        let file = entry.file_name();
        if let Some(name) = file.to_str().and_then(|name| name.strip_prefix("SEKOLY_DAILY_")).and_then(|name| name.strip_suffix(".json")) {
            if let Ok(timestamp) = name.parse::<u128>() {
                if timestamp / 86_400_000_000_000 == now / 86_400_000_000_000 {
                    return Ok(entry.path().to_string_lossy().to_string());
                }
            }
        }
    }
    let path = write_backup(&parent, &json, "SEKOLY_DAILY")?;
    let mut files: Vec<_> = fs::read_dir(&parent).map_err(|error| error.to_string())?
        .filter_map(Result::ok).map(|entry| entry.path())
        .filter(|path| path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.starts_with("SEKOLY_DAILY_") && name.ends_with(".json")))
        .collect();
    files.sort();
    let excess = files.len().saturating_sub(7);
    for old in files.iter().take(excess) { fs::remove_file(old).map_err(|error| error.to_string())?; }
    Ok(path)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            load_database,
            save_database,
            reset_database,
            create_recovery_backup,
            create_daily_backup,
            database_path
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de Sekoly");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_backup_preserves_full_json_and_rejects_invalid_content() {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("sekoly-backup-test-{nonce}"));
        let json = r#"{"tuitionPayments":[{"amount":15000}],"cashTransactions":[{"amount":500}],"salaryPayments":[{"netSalary":2000}]}"#;
        let path = write_backup(&dir, json, "TEST").unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), json);
        assert!(write_backup(&dir, "{invalid}", "TEST").is_err());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
}
