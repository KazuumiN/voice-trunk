use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::fs;

use crate::config::get_base_path;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BatchStatus {
    Open,
    Uploading,
    Completed,
    PartialError,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub recording_id: String,
    pub uploaded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_r2_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_parts: Option<Vec<u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multipart_upload_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchState {
    pub status: BatchStatus,
    pub device_id: String,
    /// Keyed by sha256
    pub files: HashMap<String, FileStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppState {
    /// Keyed by batch ID
    pub batches: HashMap<String, BatchState>,
}

/// Thread-safe wrapper for AppState, wrapped in Arc for sharing across tasks
pub type ManagedState = Arc<ManagedStateInner>;

pub struct ManagedStateInner {
    pub inner: Mutex<AppState>,
}

pub fn new_managed_state(state: AppState) -> ManagedState {
    Arc::new(ManagedStateInner {
        inner: Mutex::new(state),
    })
}

fn get_state_path() -> std::path::PathBuf {
    get_base_path().join("state.json")
}

pub async fn read_state_from_disk() -> Result<AppState, AppError> {
    let state_path = get_state_path();
    if !state_path.exists() {
        return Ok(AppState::default());
    }
    let raw = fs::read_to_string(&state_path).await?;
    let state: AppState = serde_json::from_str(&raw)?;
    Ok(state)
}

pub async fn write_state_to_disk(state: &AppState) -> Result<(), AppError> {
    let base_path = get_base_path();
    fs::create_dir_all(&base_path).await?;
    let state_path = get_state_path();
    let raw = serde_json::to_string_pretty(state)?;
    fs::write(&state_path, raw).await?;
    Ok(())
}

/// Helper to persist current managed state to disk
pub async fn persist_state(managed: &ManagedStateInner) -> Result<(), AppError> {
    let state = managed.inner.lock().unwrap().clone();
    write_state_to_disk(&state).await
}
