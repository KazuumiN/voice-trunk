use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

use log::{error, info, warn};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::config::read_config;
use crate::events::{MountDetected, MountRemoved};

const SYSTEM_VOLUMES: &[&str] = &[
    ".vol",
    "Macintosh HD",
    "Macintosh HD - Data",
    "Recovery",
    "Preboot",
    "VM",
    "Update",
];

fn is_system_volume(name: &str) -> bool {
    SYSTEM_VOLUMES.contains(&name)
}

fn has_recorder_id(mount_path: &Path) -> bool {
    mount_path.join("RECORDER_ID.json").exists()
}

/// Start watching /Volumes for mount/unmount events.
/// Uses notify (FSEvents) with polling fallback.
pub fn start_volume_watcher(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = try_fsevent_watcher(app_handle.clone()).await {
            warn!("FSEvent watcher failed: {e}, falling back to polling");
            poll_volumes(app_handle).await;
        }
    });
}

async fn try_fsevent_watcher(app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (tx, mut rx) = mpsc::channel::<notify::Event>(64);
    let mut known_mounts = get_current_mounts();

    let sync_tx = std::sync::mpsc::channel::<notify::Event>();
    let sender = sync_tx.0;
    let receiver = sync_tx.1;

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = sender.send(event);
            }
        },
        notify::Config::default(),
    )?;

    watcher.watch(Path::new("/Volumes"), RecursiveMode::NonRecursive)?;

    // Bridge sync receiver to async channel
    let async_tx = tx.clone();
    std::thread::spawn(move || {
        while let Ok(event) = receiver.recv() {
            if async_tx.blocking_send(event).is_err() {
                break;
            }
        }
    });

    info!("Volume watcher started (FSEvents)");

    loop {
        // Check for events with a timeout to periodically reconcile
        match tokio::time::timeout(Duration::from_secs(3), rx.recv()).await {
            Ok(Some(event)) => {
                if matches!(
                    event.kind,
                    EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
                ) {
                    reconcile_mounts(&mut known_mounts, &app_handle).await;
                }
            }
            Ok(None) => break, // Channel closed
            Err(_) => {
                // Timeout — periodic reconciliation
                reconcile_mounts(&mut known_mounts, &app_handle).await;
            }
        }
    }

    Ok(())
}

async fn poll_volumes(app_handle: AppHandle) {
    let config = read_config().await.unwrap_or_default();
    let interval = Duration::from_millis(config.watch_interval_ms);
    let mut known_mounts = get_current_mounts();

    info!("Volume watcher started (polling, {}ms)", interval.as_millis());

    loop {
        tokio::time::sleep(interval).await;
        reconcile_mounts(&mut known_mounts, &app_handle).await;
    }
}

fn get_current_mounts() -> HashSet<String> {
    let mut mounts = HashSet::new();
    if let Ok(entries) = std::fs::read_dir("/Volumes") {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                mounts.insert(name.to_string());
            }
        }
    }
    mounts
}

async fn reconcile_mounts(known: &mut HashSet<String>, app_handle: &AppHandle) {
    let current = get_current_mounts();

    // Detect new mounts
    for name in &current {
        if !known.contains(name) && !is_system_volume(name) {
            let path = format!("/Volumes/{}", name);
            let has_id = has_recorder_id(Path::new(&path));

            info!("Mount detected: {} (recorder_id: {})", path, has_id);

            let payload = MountDetected {
                path: path.clone(),
                name: name.clone(),
                has_recorder_id: has_id,
            };
            if let Err(e) = app_handle.emit("mount-detected", &payload) {
                error!("Failed to emit mount-detected: {e}");
            }

            // Auto-import: handled by frontend listening to events
        }
    }

    // Detect removed mounts
    for name in known.iter() {
        if !current.contains(name) && !is_system_volume(name) {
            let path = format!("/Volumes/{}", name);
            info!("Mount removed: {}", path);

            let payload = MountRemoved {
                path,
                name: name.clone(),
            };
            if let Err(e) = app_handle.emit("mount-removed", &payload) {
                error!("Failed to emit mount-removed: {e}");
            }
        }
    }

    *known = current;
}
