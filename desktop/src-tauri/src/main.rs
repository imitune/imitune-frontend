// File: imitune-frontend/desktop/src-tauri/src/main.rs

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    // Build and run the Tauri application.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

