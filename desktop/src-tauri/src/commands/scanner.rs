use serde::Serialize;
use std::path::Path;
use walkdir::WalkDir;

use crate::error::AppError;

const AUDIO_EXTENSIONS: &[&str] = &["wav", "mp3", "wma", "m4a", "flac", "ogg"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    /// Unix timestamp in milliseconds
    pub modified: f64,
}

#[tauri::command]
pub async fn scan_files(dir_path: String) -> Result<Vec<FileInfo>, AppError> {
    let dir = Path::new(&dir_path);
    if !dir.exists() {
        return Err(AppError::NotFound(format!("Directory not found: {}", dir_path)));
    }

    let mut results = Vec::new();

    for entry in WalkDir::new(dir)
        .into_iter()
        .filter_entry(|e| {
            // Skip dot directories
            if e.file_type().is_dir() {
                return !e
                    .file_name()
                    .to_str()
                    .map(|s| s.starts_with('.'))
                    .unwrap_or(false);
            }
            true
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        let is_audio = ext
            .as_deref()
            .map(|e| AUDIO_EXTENSIONS.contains(&e))
            .unwrap_or(false);

        if !is_audio {
            continue;
        }

        if let Ok(metadata) = entry.metadata() {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs_f64() * 1000.0)
                .unwrap_or(0.0);

            results.push(FileInfo {
                path: path.to_string_lossy().to_string(),
                name: entry.file_name().to_string_lossy().to_string(),
                size: metadata.len(),
                modified,
            });
        }
    }

    // Sort by modified date, newest first
    results.sort_by(|a, b| b.modified.partial_cmp(&a.modified).unwrap_or(std::cmp::Ordering::Equal));

    Ok(results)
}
