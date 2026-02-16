use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub server_url: String,
    #[serde(default = "default_max_storage_gb")]
    pub max_storage_gb: u64,
    #[serde(default = "default_ffmpeg_path")]
    pub ffmpeg_path: String,
    #[serde(default = "default_auto_import")]
    pub auto_import: bool,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default = "default_watch_interval_ms")]
    pub watch_interval_ms: u64,
}

fn default_max_storage_gb() -> u64 {
    50
}
fn default_ffmpeg_path() -> String {
    "ffmpeg".to_string()
}
fn default_auto_import() -> bool {
    true
}
fn default_watch_interval_ms() -> u64 {
    3000
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_url: "http://localhost:8787".to_string(),
            max_storage_gb: default_max_storage_gb(),
            ffmpeg_path: default_ffmpeg_path(),
            auto_import: default_auto_import(),
            auto_start: false,
            watch_interval_ms: default_watch_interval_ms(),
        }
    }
}

pub fn get_base_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join("Library")
        .join("Application Support")
        .join("com.liquitous.voice-trunk")
}

pub fn get_config_path() -> PathBuf {
    get_base_path().join("config.json")
}

pub fn get_inbox_path() -> PathBuf {
    get_base_path().join("inbox")
}

pub async fn read_config() -> Result<AppConfig, AppError> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&config_path).await?;
    let config: AppConfig = serde_json::from_str(&raw)?;
    Ok(config)
}

pub async fn write_config(config: &AppConfig) -> Result<(), AppError> {
    let base_path = get_base_path();
    fs::create_dir_all(&base_path).await?;
    let config_path = get_config_path();
    let raw = serde_json::to_string_pretty(config)?;
    fs::write(&config_path, raw).await?;
    Ok(())
}
