use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::error::AppError;
use crate::events::HashProgress;

const CHUNK_SIZE: usize = 1024 * 1024; // 1MB
const PROGRESS_INTERVAL: u64 = 5 * 1024 * 1024; // Emit progress every 5MB

#[tauri::command]
pub async fn hash_file(path: String, app_handle: AppHandle) -> Result<String, AppError> {
    let metadata = fs::metadata(&path).await?;
    let total_bytes = metadata.len();
    let file_name = std::path::Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let mut file = tokio::fs::File::open(&path).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut bytes_hashed: u64 = 0;
    let mut last_progress: u64 = 0;

    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        bytes_hashed += n as u64;

        if bytes_hashed - last_progress >= PROGRESS_INTERVAL {
            last_progress = bytes_hashed;
            let _ = app_handle.emit(
                "hash-progress",
                HashProgress {
                    file_name: file_name.clone(),
                    bytes_hashed,
                    total_bytes,
                },
            );
        }
    }

    let hash = format!("{:x}", hasher.finalize());
    Ok(hash)
}

#[tauri::command]
pub async fn copy_with_hash(
    src: String,
    dest: String,
    app_handle: AppHandle,
) -> Result<String, AppError> {
    let metadata = fs::metadata(&src).await?;
    let total_bytes = metadata.len();
    let file_name = std::path::Path::new(&src)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        fs::create_dir_all(parent).await?;
    }

    let mut reader = tokio::fs::File::open(&src).await?;
    let mut writer = tokio::fs::File::create(&dest).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut bytes_hashed: u64 = 0;
    let mut last_progress: u64 = 0;

    loop {
        let n = reader.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        writer.write_all(&buf[..n]).await?;
        bytes_hashed += n as u64;

        if bytes_hashed - last_progress >= PROGRESS_INTERVAL {
            last_progress = bytes_hashed;
            let _ = app_handle.emit(
                "hash-progress",
                HashProgress {
                    file_name: file_name.clone(),
                    bytes_hashed,
                    total_bytes,
                },
            );
        }
    }

    writer.flush().await?;

    let hash = format!("{:x}", hasher.finalize());
    Ok(hash)
}
