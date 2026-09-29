#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn database_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| {
        format!("Impossible de localiser les données de l'application: {error}")
    })?;

    fs::create_dir_all(&dir)
        .map_err(|error| format!("Impossible de créer le dossier de données: {error}"))?;

    Ok(dir.join("sekoly.sqlite"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let path = database_file(app)?;
    let connection =
        Connection::open(path).map_err(|error| format!("Impossible d'ouvrir SQLite: {error}"))?;

    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

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
        .query_row("SELECT json FROM app_state WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
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
            database_path
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de Sekoly");
}
