use serde::Serialize;
use std::path::Path;
use tokio::fs;

use crate::error::AppError;

const SYSTEM_VOLUMES: &[&str] = &[
    ".vol",
    "Macintosh HD",
    "Macintosh HD - Data",
    "Recovery",
    "Preboot",
    "VM",
    "Update",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub name: String,
    pub path: String,
    pub has_recorder_id: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderIdentifier {
    pub device_id: String,
    pub label: String,
    pub org_id_hint: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn scan_volumes() -> Result<Vec<VolumeInfo>, AppError> {
    let mut volumes = Vec::new();

    let mut entries = fs::read_dir("/Volumes").await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        if SYSTEM_VOLUMES.contains(&name.as_str()) {
            continue;
        }

        let path = format!("/Volumes/{}", name);
        let has_recorder_id = Path::new(&path).join("RECORDER_ID.json").exists();

        volumes.push(VolumeInfo {
            name,
            path,
            has_recorder_id,
        });
    }

    Ok(volumes)
}

#[tauri::command]
pub async fn identify_device(mount_path: String) -> Result<RecorderIdentifier, AppError> {
    let file_path = Path::new(&mount_path).join("RECORDER_ID.json");
    if !file_path.exists() {
        return Err(AppError::NotFound(format!(
            "No RECORDER_ID.json found at {}",
            mount_path
        )));
    }

    let raw = fs::read_to_string(&file_path).await?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)?;

    let device_id = parsed["deviceId"]
        .as_str()
        .ok_or_else(|| AppError::InvalidInput("Missing deviceId in RECORDER_ID.json".into()))?
        .to_string();

    let label = parsed["label"]
        .as_str()
        .ok_or_else(|| AppError::InvalidInput("Missing label in RECORDER_ID.json".into()))?
        .to_string();

    let org_id_hint = parsed["orgIdHint"].as_str().map(|s| s.to_string());
    let notes = parsed["notes"].as_str().map(|s| s.to_string());

    Ok(RecorderIdentifier {
        device_id,
        label,
        org_id_hint,
        notes,
    })
}
