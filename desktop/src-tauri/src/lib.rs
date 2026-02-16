mod commands;
mod config;
mod error;
mod events;
mod state;
mod tray;
mod volume_watcher;

use log::info;
use tauri::Manager;

use state::{new_managed_state, read_state_from_disk};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Load persisted state from disk
            let state = tauri::async_runtime::block_on(async {
                read_state_from_disk().await.unwrap_or_default()
            });
            app.manage(new_managed_state(state));

            // Set up system tray
            tray::setup_tray(app.handle())?;

            // Start volume watcher
            volume_watcher::start_volume_watcher(app.handle().clone());

            info!("VoiceTrunk desktop app started");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Config
            commands::config::get_config,
            commands::config::save_config,
            commands::config::get_auth_credentials,
            commands::config::save_auth_credentials,
            // Volumes
            commands::volumes::scan_volumes,
            commands::volumes::identify_device,
            // Scanner
            commands::scanner::scan_files,
            // Hasher
            commands::hasher::hash_file,
            commands::hasher::copy_with_hash,
            // Converter
            commands::converter::check_ffmpeg,
            commands::converter::detect_ffmpeg_path,
            commands::converter::needs_conversion,
            commands::converter::convert_audio,
            // Importer
            commands::importer::start_import,
            commands::importer::cancel_import,
            commands::importer::upload_files,
            // Batches
            commands::batches::get_batches,
            commands::batches::clean_completed_batches,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
