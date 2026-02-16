use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::Utc;
use log::{error, info, warn};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_store::StoreExt;

use crate::commands::api_client::{self, AuthHeaders, PreflightFile};
use crate::commands::converter;
use crate::commands::hasher;
use crate::commands::scanner;
use crate::commands::uploader;
use crate::config::{get_inbox_path, read_config};
use crate::error::AppError;
use crate::events::ImportProgress;
use crate::state::{persist_state, BatchState, BatchStatus, FileStatus, ManagedState, ManagedStateInner};

/// Global cancellation flags, keyed by batch_id
static CANCEL_FLAGS: std::sync::LazyLock<
    std::sync::Mutex<HashMap<String, Arc<AtomicBool>>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

fn generate_batch_id() -> String {
    let now = Utc::now();
    let ts = now.format("%Y%m%d%H%M%S").to_string();
    let rand: String = (0..6)
        .map(|_| rand_char())
        .collect();
    format!("batch-{}-{}", ts, rand)
}

fn rand_char() -> char {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let s = RandomState::new();
    let mut hasher = s.build_hasher();
    hasher.write_u64(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64,
    );
    let val = hasher.finish();
    let chars = b"abcdefghijklmnopqrstuvwxyz0123456789";
    chars[(val % chars.len() as u64) as usize] as char
}

/// Check if the inbox has room for additional bytes
async fn check_storage_limit(additional_bytes: u64) -> Result<bool, AppError> {
    let config = read_config().await?;
    let max_bytes = config.max_storage_gb * 1024 * 1024 * 1024;
    let current_size = dir_size(&get_inbox_path()).await;
    Ok(current_size + additional_bytes <= max_bytes)
}

/// Recursively compute directory size
async fn dir_size(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    let mut entries = match tokio::fs::read_dir(path).await {
        Ok(e) => e,
        Err(_) => return 0,
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Ok(metadata) = entry.metadata().await {
            if metadata.is_dir() {
                total += Box::pin(dir_size(&entry.path())).await;
            } else {
                total += metadata.len();
            }
        }
    }
    total
}

#[tauri::command]
pub async fn start_import(
    mount_path: String,
    device_id: String,
    app_handle: AppHandle,
    state: State<'_, ManagedState>,
) -> Result<String, AppError> {
    let config = read_config().await?;
    let batch_id = generate_batch_id();

    // Set up cancellation flag
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut flags = CANCEL_FLAGS.lock().unwrap();
        flags.insert(batch_id.clone(), cancel.clone());
    }

    // Read credentials from store
    let auth = {
        let store_result = app_handle.store("credentials.json");
        match store_result {
            Ok(store) => {
                let client_id = store
                    .get("clientId")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_default();
                let client_secret = store
                    .get("clientSecret")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_default();
                AuthHeaders {
                    client_id,
                    client_secret,
                }
            }
            Err(_) => AuthHeaders {
                client_id: String::new(),
                client_secret: String::new(),
            },
        }
    };

    // Initialize batch state
    {
        let mut app_state = state.inner.lock().unwrap();
        app_state.batches.insert(
            batch_id.clone(),
            BatchState {
                status: BatchStatus::Open,
                device_id: device_id.clone(),
                files: HashMap::new(),
            },
        );
    }
    persist_state(&state).await?;

    // Clone Arc for the spawned task (deref State -> Arc, then clone Arc)
    let state_arc: ManagedState = (*state).clone();
    let batch_id_ret = batch_id.clone();

    tokio::spawn(async move {
        let batch_id = batch_id;
        if let Err(e) = run_import(
            &mount_path,
            &device_id,
            &batch_id,
            &config.server_url,
            &auth,
            &config.ffmpeg_path,
            &cancel,
            &state_arc,
            &app_handle,
        )
        .await
        {
            error!("Import failed for batch {}: {}", batch_id, e);
            {
                let mut app_state = state_arc.inner.lock().unwrap();
                if let Some(batch) = app_state.batches.get_mut(&batch_id) {
                    batch.status = BatchStatus::PartialError;
                }
            }
            let _ = persist_state(&state_arc).await;

            let _ = app_handle.emit(
                "import-progress",
                ImportProgress {
                    batch_id: batch_id.clone(),
                    phase: "error".to_string(),
                    current: 0,
                    total: 0,
                    file_name: None,
                    message: Some(e.to_string()),
                },
            );
        }

        // Clean up cancel flag
        let mut flags = CANCEL_FLAGS.lock().unwrap();
        flags.remove(&batch_id);
    });

    Ok(batch_id_ret)
}

async fn run_import(
    mount_path: &str,
    device_id: &str,
    batch_id: &str,
    server_url: &str,
    auth: &AuthHeaders,
    ffmpeg_path: &str,
    cancel: &AtomicBool,
    managed_state: &ManagedStateInner,
    app_handle: &AppHandle,
) -> Result<(), AppError> {
    // 1. Scan files
    let _ = app_handle.emit(
        "import-progress",
        ImportProgress {
            batch_id: batch_id.to_string(),
            phase: "scanning".to_string(),
            current: 0,
            total: 0,
            file_name: None,
            message: None,
        },
    );

    let recordings = scanner::scan_files(mount_path.to_string()).await?;
    if recordings.is_empty() {
        info!("No audio files found on {}", mount_path);
        return Ok(());
    }

    let total = recordings.len() as u32;
    info!("Found {} audio file(s) on {}", total, mount_path);

    // Check ffmpeg availability
    let has_ffmpeg = converter::check_ffmpeg(Some(ffmpeg_path.to_string())).await?;
    if !has_ffmpeg {
        warn!(
            "ffmpeg not found at '{}'. Audio conversion will be skipped.",
            ffmpeg_path
        );
    }

    // 2. Create inbox directory
    let inbox_dir = get_inbox_path().join(batch_id).join(device_id);
    tokio::fs::create_dir_all(&inbox_dir).await?;

    // 3. Copy files to inbox with hash computation
    struct LocalFileInfo {
        sha256: String,
        local_path: String,
        original_file_name: String,
        size_bytes: u64,
        modified: f64,
    }

    let mut file_infos = Vec::new();

    for (idx, rec) in recordings.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(AppError::Cancelled);
        }

        if !check_storage_limit(rec.size).await? {
            error!("Storage limit reached. Cannot copy more files.");
            break;
        }

        let dest_path = inbox_dir.join(&rec.name);
        let dest_str = dest_path.to_string_lossy().to_string();

        let _ = app_handle.emit(
            "import-progress",
            ImportProgress {
                batch_id: batch_id.to_string(),
                phase: "copying".to_string(),
                current: idx as u32 + 1,
                total,
                file_name: Some(rec.name.clone()),
                message: None,
            },
        );

        info!(
            "Copying {} ({:.1} MB)...",
            rec.name,
            rec.size as f64 / 1024.0 / 1024.0
        );

        let sha256 =
            hasher::copy_with_hash(rec.path.clone(), dest_str.clone(), app_handle.clone()).await?;

        let mut final_path = dest_str.clone();

        // Convert if needed
        if has_ffmpeg && converter::needs_conversion(rec.name.clone(), rec.size) {
            let converted_name = Path::new(&rec.name)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
                + ".mp3";
            let converted_path = inbox_dir.join(&converted_name);
            let converted_str = converted_path.to_string_lossy().to_string();

            let _ = app_handle.emit(
                "import-progress",
                ImportProgress {
                    batch_id: batch_id.to_string(),
                    phase: "converting".to_string(),
                    current: idx as u32 + 1,
                    total,
                    file_name: Some(rec.name.clone()),
                    message: None,
                },
            );

            info!("Converting {} -> MP3...", rec.name);
            converter::convert_audio(
                dest_path.to_string_lossy().to_string(),
                converted_str.clone(),
                Some(ffmpeg_path.to_string()),
            )
            .await?;
            final_path = converted_str;
        }

        file_infos.push(LocalFileInfo {
            sha256: sha256.clone(),
            local_path: final_path,
            original_file_name: rec.name.clone(),
            size_bytes: rec.size,
            modified: rec.modified,
        });

        // Update state
        {
            let mut app_state = managed_state.inner.lock().unwrap();
            if let Some(batch) = app_state.batches.get_mut(batch_id) {
                batch.files.insert(
                    sha256,
                    FileStatus {
                        recording_id: String::new(),
                        uploaded: false,
                        ..Default::default()
                    },
                );
            }
        }
        persist_state(managed_state).await?;
    }

    if file_infos.is_empty() {
        return Ok(());
    }

    if cancel.load(Ordering::Relaxed) {
        return Err(AppError::Cancelled);
    }

    // 4. Preflight batch
    let _ = app_handle.emit(
        "import-progress",
        ImportProgress {
            batch_id: batch_id.to_string(),
            phase: "preflight".to_string(),
            current: 0,
            total: file_infos.len() as u32,
            file_name: None,
            message: None,
        },
    );

    info!("Checking {} file(s) with server...", file_infos.len());

    let preflight_files: Vec<PreflightFile> = file_infos
        .iter()
        .map(|f| PreflightFile {
            device_id: device_id.to_string(),
            original_file_name: f.original_file_name.clone(),
            recorder_file_created_at: Some(
                chrono::DateTime::from_timestamp_millis(f.modified as i64)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
            ),
            size_bytes: f.size_bytes,
            sha256: f.sha256.clone(),
        })
        .collect();

    let preflight_results = api_client::preflight_batch(
        server_url.to_string(),
        auth.clone(),
        batch_id.to_string(),
        preflight_files,
    )
    .await?;

    // 5. Update state with server response
    let new_files: Vec<_> = preflight_results
        .iter()
        .filter(|r| r.status == "NEW")
        .collect();
    let dupes: Vec<_> = preflight_results
        .iter()
        .filter(|r| r.status == "ALREADY_EXISTS")
        .collect();

    if !dupes.is_empty() {
        info!("{} file(s) already uploaded, skipping.", dupes.len());
    }

    {
        let mut app_state = managed_state.inner.lock().unwrap();
        for result in &preflight_results {
            if let Some(batch) = app_state.batches.get_mut(batch_id) {
                if let Some(file_status) = batch.files.get_mut(&result.sha256) {
                    file_status.recording_id = result.recording_id.clone();
                    file_status.upload_id = result.upload_id.clone();
                    file_status.raw_r2_key = result.raw_r2_key.clone();
                    file_status.uploaded = result.status == "ALREADY_EXISTS";
                }
            }
        }
    }
    persist_state(managed_state).await?;

    if cancel.load(Ordering::Relaxed) {
        return Err(AppError::Cancelled);
    }

    // 6. Upload new files
    if !new_files.is_empty() {
        info!("Uploading {} new file(s)...", new_files.len());

        {
            let mut app_state = managed_state.inner.lock().unwrap();
            if let Some(batch) = app_state.batches.get_mut(batch_id) {
                batch.status = BatchStatus::Uploading;
            }
        }
        persist_state(managed_state).await?;

        for (idx, result) in new_files.iter().enumerate() {
            if cancel.load(Ordering::Relaxed) {
                return Err(AppError::Cancelled);
            }

            let file_info = file_infos.iter().find(|f| f.sha256 == result.sha256);
            let upload_id = match (&file_info, &result.upload_id) {
                (Some(_), Some(uid)) => uid.clone(),
                _ => continue,
            };
            let file_info = file_info.unwrap();

            let _ = app_handle.emit(
                "import-progress",
                ImportProgress {
                    batch_id: batch_id.to_string(),
                    phase: "uploading".to_string(),
                    current: idx as u32 + 1,
                    total: new_files.len() as u32,
                    file_name: Some(file_info.original_file_name.clone()),
                    message: None,
                },
            );

            info!("Uploading {}...", file_info.original_file_name);

            let upload_result = if file_info.size_bytes > uploader::MULTIPART_THRESHOLD {
                // Multipart upload
                let presign_result = api_client::presign(
                    server_url.to_string(),
                    auth.clone(),
                    result.recording_id.clone(),
                    upload_id.clone(),
                    Some(true),
                )
                .await?;

                let mp_upload_id = presign_result
                    .upload_id
                    .clone()
                    .unwrap_or_else(|| upload_id.clone());

                uploader::upload_multipart(
                    &file_info.local_path,
                    server_url,
                    auth,
                    &result.recording_id,
                    &mp_upload_id,
                    batch_id,
                    &result.sha256,
                    managed_state,
                    app_handle,
                    &file_info.original_file_name,
                )
                .await
            } else {
                // Single upload
                let presign_result = api_client::presign(
                    server_url.to_string(),
                    auth.clone(),
                    result.recording_id.clone(),
                    upload_id.clone(),
                    None,
                )
                .await?;

                uploader::upload_single(
                    &file_info.local_path,
                    &presign_result,
                    app_handle,
                    &file_info.original_file_name,
                    &result.recording_id,
                )
                .await
            };

            match upload_result {
                Ok(()) => {
                    info!("Uploaded {}", file_info.original_file_name);
                    {
                        let mut app_state = managed_state.inner.lock().unwrap();
                        if let Some(batch) = app_state.batches.get_mut(batch_id) {
                            if let Some(fs) = batch.files.get_mut(&result.sha256) {
                                fs.uploaded = true;
                            }
                        }
                    }
                    persist_state(managed_state).await?;
                }
                Err(e) => {
                    error!(
                        "Failed to upload {}: {}",
                        file_info.original_file_name, e
                    );
                    {
                        let mut app_state = managed_state.inner.lock().unwrap();
                        if let Some(batch) = app_state.batches.get_mut(batch_id) {
                            if let Some(fs) = batch.files.get_mut(&result.sha256) {
                                fs.error = Some(e.to_string());
                            }
                        }
                    }
                    persist_state(managed_state).await?;
                }
            }
        }

        // Update batch status
        let final_status = {
            let app_state = managed_state.inner.lock().unwrap();
            if let Some(batch) = app_state.batches.get(batch_id) {
                let has_errors = batch.files.values().any(|f| f.error.is_some());
                let all_uploaded = batch.files.values().all(|f| f.uploaded);
                if all_uploaded {
                    BatchStatus::Completed
                } else if has_errors {
                    BatchStatus::PartialError
                } else {
                    BatchStatus::Uploading
                }
            } else {
                BatchStatus::Completed
            }
        };

        {
            let mut app_state = managed_state.inner.lock().unwrap();
            if let Some(batch) = app_state.batches.get_mut(batch_id) {
                batch.status = final_status.clone();
            }
        }
        persist_state(managed_state).await?;

        info!("Batch {} status: {:?}", batch_id, final_status);
    } else {
        info!("All files already uploaded.");
        {
            let mut app_state = managed_state.inner.lock().unwrap();
            if let Some(batch) = app_state.batches.get_mut(batch_id) {
                batch.status = BatchStatus::Completed;
            }
        }
        persist_state(managed_state).await?;
    }

    let _ = app_handle.emit(
        "import-progress",
        ImportProgress {
            batch_id: batch_id.to_string(),
            phase: "done".to_string(),
            current: 0,
            total: 0,
            file_name: None,
            message: None,
        },
    );

    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualUploadFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
}

/// Manual upload: hash + preflight + upload files selected by the user
#[tauri::command]
pub async fn upload_files(
    files: Vec<ManualUploadFile>,
    app_handle: AppHandle,
    state: State<'_, ManagedState>,
) -> Result<String, AppError> {
    let config = read_config().await?;
    let batch_id = generate_batch_id();

    let auth = {
        let store_result = app_handle.store("credentials.json");
        match store_result {
            Ok(store) => {
                let client_id = store
                    .get("clientId")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_default();
                let client_secret = store
                    .get("clientSecret")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_default();
                AuthHeaders {
                    client_id,
                    client_secret,
                }
            }
            Err(_) => AuthHeaders {
                client_id: String::new(),
                client_secret: String::new(),
            },
        }
    };

    // Initialize batch state
    {
        let mut app_state = state.inner.lock().unwrap();
        app_state.batches.insert(
            batch_id.clone(),
            BatchState {
                status: BatchStatus::Open,
                device_id: String::new(),
                files: std::collections::HashMap::new(),
            },
        );
    }
    persist_state(&state).await?;

    // Hash each file
    let mut file_infos = Vec::new();
    for file in &files {
        info!("Hashing {}...", file.name);
        let sha256 = hasher::hash_file(file.path.clone(), app_handle.clone()).await?;
        file_infos.push((file, sha256));
    }

    // Preflight
    let preflight_files: Vec<PreflightFile> = file_infos
        .iter()
        .map(|(f, sha256)| PreflightFile {
            device_id: String::new(),
            original_file_name: f.name.clone(),
            recorder_file_created_at: None,
            size_bytes: f.size_bytes,
            sha256: sha256.clone(),
        })
        .collect();

    let preflight_results = api_client::preflight_batch(
        config.server_url.clone(),
        auth.clone(),
        batch_id.clone(),
        preflight_files,
    )
    .await?;

    // Update state
    {
        let mut app_state = state.inner.lock().unwrap();
        if let Some(batch) = app_state.batches.get_mut(&batch_id) {
            for result in &preflight_results {
                batch.files.insert(
                    result.sha256.clone(),
                    FileStatus {
                        recording_id: result.recording_id.clone(),
                        uploaded: result.status == "ALREADY_EXISTS",
                        upload_id: result.upload_id.clone(),
                        raw_r2_key: result.raw_r2_key.clone(),
                        ..Default::default()
                    },
                );
            }
            batch.status = BatchStatus::Uploading;
        }
    }
    persist_state(&state).await?;

    // Upload NEW files
    let new_files: Vec<_> = preflight_results
        .iter()
        .filter(|r| r.status == "NEW")
        .collect();

    let state_arc: ManagedState = (*state).clone();

    for result in &new_files {
        let file_entry = file_infos.iter().find(|(_, sha)| sha == &result.sha256);
        let upload_id = match (&file_entry, &result.upload_id) {
            (Some(_), Some(uid)) => uid.clone(),
            _ => continue,
        };
        let (file, _) = file_entry.unwrap();

        if file.size_bytes > uploader::MULTIPART_THRESHOLD {
            let presign_result = api_client::presign(
                config.server_url.clone(),
                auth.clone(),
                result.recording_id.clone(),
                upload_id.clone(),
                Some(true),
            )
            .await?;

            let mp_upload_id = presign_result
                .upload_id
                .clone()
                .unwrap_or_else(|| upload_id.clone());

            uploader::upload_multipart(
                &file.path,
                &config.server_url,
                &auth,
                &result.recording_id,
                &mp_upload_id,
                &batch_id,
                &result.sha256,
                &state_arc,
                &app_handle,
                &file.name,
            )
            .await?;
        } else {
            let presign_result = api_client::presign(
                config.server_url.clone(),
                auth.clone(),
                result.recording_id.clone(),
                upload_id,
                None,
            )
            .await?;

            uploader::upload_single(
                &file.path,
                &presign_result,
                &app_handle,
                &file.name,
                &result.recording_id,
            )
            .await?;
        }

        // Mark as uploaded
        {
            let mut app_state = state_arc.inner.lock().unwrap();
            if let Some(batch) = app_state.batches.get_mut(&batch_id) {
                if let Some(fs) = batch.files.get_mut(&result.sha256) {
                    fs.uploaded = true;
                }
            }
        }
        persist_state(&state_arc).await?;
    }

    // Final status
    {
        let mut app_state = state_arc.inner.lock().unwrap();
        if let Some(batch) = app_state.batches.get_mut(&batch_id) {
            batch.status = BatchStatus::Completed;
        }
    }
    persist_state(&state_arc).await?;

    Ok(batch_id)
}

#[tauri::command]
pub fn cancel_import(batch_id: String) -> Result<(), AppError> {
    let flags = CANCEL_FLAGS.lock().unwrap();
    if let Some(flag) = flags.get(&batch_id) {
        flag.store(true, Ordering::Relaxed);
        info!("Cancellation requested for batch {}", batch_id);
        Ok(())
    } else {
        Err(AppError::NotFound(format!(
            "No active import found for batch {}",
            batch_id
        )))
    }
}
