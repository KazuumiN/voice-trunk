use std::collections::HashMap;

use log::info;
use tauri::State;
use tokio::fs;

use crate::config::get_inbox_path;
use crate::error::AppError;
use crate::state::{BatchState, ManagedState};

#[tauri::command]
pub fn get_batches(
    state: State<'_, ManagedState>,
) -> Result<HashMap<String, BatchState>, AppError> {
    let app_state = state.inner.lock().unwrap();
    Ok(app_state.batches.clone())
}

#[tauri::command]
pub async fn clean_completed_batches(
    state: State<'_, ManagedState>,
) -> Result<u32, AppError> {
    let inbox_path = get_inbox_path();
    let mut deleted_count = 0u32;
    let batches_to_remove: Vec<String>;

    // Find completed batches
    {
        let app_state = state.inner.lock().unwrap();
        batches_to_remove = app_state
            .batches
            .iter()
            .filter(|(_, batch)| batch.files.values().all(|f| f.uploaded))
            .map(|(id, _)| id.clone())
            .collect();
    }

    // Remove inbox directories for completed batches
    for batch_id in &batches_to_remove {
        let batch_dir = inbox_path.join(batch_id);
        if batch_dir.exists() {
            let count = count_files(&batch_dir).await;
            if let Err(e) = fs::remove_dir_all(&batch_dir).await {
                log::error!(
                    "Failed to remove batch directory {}: {}",
                    batch_dir.display(),
                    e
                );
                continue;
            }
            deleted_count += count;
            info!("Cleaned batch {} ({} files)", batch_id, count);
        }
    }

    Ok(deleted_count)
}

async fn count_files(path: &std::path::Path) -> u32 {
    let mut count = 0u32;
    let mut entries = match fs::read_dir(path).await {
        Ok(e) => e,
        Err(_) => return 0,
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Ok(metadata) = entry.metadata().await {
            if metadata.is_dir() {
                count += Box::pin(count_files(&entry.path())).await;
            } else {
                count += 1;
            }
        }
    }
    count
}
