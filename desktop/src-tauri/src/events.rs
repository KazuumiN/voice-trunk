use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountDetected {
    pub path: String,
    pub name: String,
    pub has_recorder_id: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountRemoved {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub batch_id: String,
    pub phase: String,
    pub current: u32,
    pub total: u32,
    pub file_name: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashProgress {
    pub file_name: String,
    pub bytes_hashed: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    pub recording_id: String,
    pub file_name: String,
    pub bytes_uploaded: u64,
    pub total_bytes: u64,
    pub part_number: Option<u32>,
    pub total_parts: Option<u32>,
}
