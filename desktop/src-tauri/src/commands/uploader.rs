use log::info;
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::sync::Semaphore;

use crate::commands::api_client::{AuthHeaders, CompletedPart, PresignResult};
use crate::error::AppError;
use crate::events::UploadProgress;
use crate::state::{persist_state, ManagedStateInner};

pub const MULTIPART_THRESHOLD: u64 = 100 * 1024 * 1024; // 100MB
pub const PART_SIZE: u64 = 10 * 1024 * 1024; // 10MB
pub const MAX_CONCURRENT: usize = 4;

/// Upload a single file via presigned PUT URL
pub async fn upload_single(
    file_path: &str,
    presign_result: &PresignResult,
    app_handle: &AppHandle,
    file_name: &str,
    recording_id: &str,
) -> Result<(), AppError> {
    let data = fs::read(file_path).await?;
    let total_bytes = data.len() as u64;

    let client = Client::new();
    let mut request = client.put(&presign_result.url);

    for (key, value) in &presign_result.headers {
        request = request.header(key.as_str(), value.as_str());
    }

    let _ = app_handle.emit(
        "upload-progress",
        UploadProgress {
            recording_id: recording_id.to_string(),
            file_name: file_name.to_string(),
            bytes_uploaded: 0,
            total_bytes,
            part_number: None,
            total_parts: None,
        },
    );

    let res = request.body(data).send().await?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: format!("Upload failed: {}", text),
        });
    }

    let _ = app_handle.emit(
        "upload-progress",
        UploadProgress {
            recording_id: recording_id.to_string(),
            file_name: file_name.to_string(),
            bytes_uploaded: total_bytes,
            total_bytes,
            part_number: None,
            total_parts: None,
        },
    );

    Ok(())
}

/// Upload a file via multipart upload with concurrent parts
pub async fn upload_multipart(
    file_path: &str,
    server_url: &str,
    auth: &AuthHeaders,
    recording_id: &str,
    upload_id: &str,
    batch_id: &str,
    sha256: &str,
    managed_state: &ManagedStateInner,
    app_handle: &AppHandle,
    file_name: &str,
) -> Result<(), AppError> {
    let metadata = fs::metadata(file_path).await?;
    let file_size = metadata.len();
    let total_parts = ((file_size + PART_SIZE - 1) / PART_SIZE) as u32;

    // Load previously completed parts from state for resume
    let completed_parts: std::collections::HashSet<u32> = {
        let state = managed_state.inner.lock().unwrap();
        state
            .batches
            .get(batch_id)
            .and_then(|b| b.files.get(sha256))
            .and_then(|f| f.completed_parts.as_ref())
            .map(|parts| parts.iter().copied().collect())
            .unwrap_or_default()
    };

    // Save multipart upload ID to state for resume
    {
        let mut state = managed_state.inner.lock().unwrap();
        if let Some(batch) = state.batches.get_mut(batch_id) {
            if let Some(file_status) = batch.files.get_mut(sha256) {
                if file_status.multipart_upload_id.is_none() {
                    file_status.multipart_upload_id = Some(upload_id.to_string());
                }
            }
        }
    }
    persist_state(managed_state).await?;

    // Determine pending parts
    let pending_parts: Vec<u32> = (1..=total_parts)
        .filter(|p| !completed_parts.contains(p))
        .collect();

    let all_parts = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<CompletedPart>::new()));
    let semaphore = std::sync::Arc::new(Semaphore::new(MAX_CONCURRENT));

    let mut handles = Vec::new();

    for part_number in pending_parts {
        let sem = semaphore.clone();
        let all_parts = all_parts.clone();
        let server_url = server_url.to_string();
        let auth = auth.clone();
        let recording_id = recording_id.to_string();
        let upload_id = upload_id.to_string();
        let file_path = file_path.to_string();
        let app_handle = app_handle.clone();
        let file_name = file_name.to_string();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();

            // Read the part from file
            let start = (part_number as u64 - 1) * PART_SIZE;
            let end = std::cmp::min(start + PART_SIZE, file_size);
            let part_len = (end - start) as usize;

            let mut file = tokio::fs::File::open(&file_path).await?;
            tokio::io::AsyncSeekExt::seek(&mut file, std::io::SeekFrom::Start(start)).await?;
            let mut buf = vec![0u8; part_len];
            file.read_exact(&mut buf).await?;

            // Get presigned URL for this part
            let presigned_url = crate::commands::api_client::presign_part(
                server_url,
                auth,
                recording_id.clone(),
                upload_id,
                part_number,
            )
            .await?;

            // Upload part
            let client = Client::new();
            let res = client.put(&presigned_url).body(buf).send().await?;

            if !res.status().is_success() {
                let status = res.status().as_u16();
                let text = res.text().await.unwrap_or_default();
                return Err(AppError::Api {
                    status,
                    message: format!("Part {} upload failed: {}", part_number, text),
                });
            }

            let etag = res
                .headers()
                .get("etag")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    AppError::Other(format!(
                        "Part {} upload succeeded but response missing ETag header",
                        part_number
                    ))
                })?;

            let _ = app_handle.emit(
                "upload-progress",
                UploadProgress {
                    recording_id: recording_id.to_string(),
                    file_name: file_name.to_string(),
                    bytes_uploaded: end,
                    total_bytes: file_size,
                    part_number: Some(part_number),
                    total_parts: Some(total_parts),
                },
            );

            all_parts.lock().await.push(CompletedPart {
                part_number,
                etag,
            });

            Ok::<u32, AppError>(part_number)
        });

        handles.push(handle);
    }

    // Wait for all uploads and persist progress
    for handle in handles {
        let part_number = handle.await.map_err(|e| AppError::Other(e.to_string()))??;

        // Update completed parts in state
        {
            let mut state = managed_state.inner.lock().unwrap();
            if let Some(batch) = state.batches.get_mut(batch_id) {
                if let Some(file_status) = batch.files.get_mut(sha256) {
                    let parts = file_status.completed_parts.get_or_insert_with(Vec::new);
                    if !parts.contains(&part_number) {
                        parts.push(part_number);
                    }
                }
            }
        }
        persist_state(managed_state).await?;
    }

    // Complete multipart upload
    let mut sorted_parts = all_parts.lock().await.clone();
    sorted_parts.sort_by_key(|p| p.part_number);

    info!(
        "Completing multipart upload for {} with {} parts",
        recording_id,
        sorted_parts.len()
    );

    crate::commands::api_client::complete_multipart(
        server_url.to_string(),
        auth.clone(),
        recording_id.to_string(),
        upload_id.to_string(),
        sorted_parts,
    )
    .await?;

    Ok(())
}
