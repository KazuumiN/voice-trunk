use std::path::Path;
use tokio::process::Command;

use crate::error::AppError;

const LARGE_WAV_THRESHOLD: u64 = 50 * 1024 * 1024; // 50MB

/// Build an extended PATH that includes common Homebrew/system locations.
/// macOS GUI apps don't inherit the user's shell PATH, so we add them explicitly.
fn extended_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let extras = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
    let mut parts: Vec<&str> = extras.to_vec();
    if !base.is_empty() {
        parts.push(&base);
    }
    parts.join(":")
}

#[tauri::command]
pub async fn check_ffmpeg(ffmpeg_path: Option<String>) -> Result<bool, AppError> {
    let ffmpeg = ffmpeg_path.unwrap_or_else(|| "ffmpeg".to_string());
    let result = Command::new(&ffmpeg)
        .arg("-version")
        .env("PATH", extended_path())
        .output()
        .await;

    match result {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

/// Discover the full path to ffmpeg using `which` and well-known locations.
#[tauri::command]
pub async fn detect_ffmpeg_path() -> Result<Option<String>, AppError> {
    // 1. Try `which ffmpeg` with extended PATH
    let which_result = Command::new("/usr/bin/which")
        .arg("ffmpeg")
        .env("PATH", extended_path())
        .output()
        .await;

    if let Ok(output) = which_result {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(Some(path));
            }
        }
    }

    // 2. Check well-known locations directly
    let common_paths = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ];

    for path in &common_paths {
        if Path::new(path).exists() {
            return Ok(Some(path.to_string()));
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn needs_conversion(file_name: String, file_size: u64) -> bool {
    let ext = Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "wma" => true,
        "wav" => file_size > LARGE_WAV_THRESHOLD,
        _ => false,
    }
}

#[tauri::command]
pub async fn convert_audio(
    input: String,
    output: String,
    ffmpeg_path: Option<String>,
) -> Result<(), AppError> {
    let ffmpeg = ffmpeg_path.unwrap_or_else(|| "ffmpeg".to_string());

    let result = Command::new(&ffmpeg)
        .args([
            "-y", "-i", &input, "-ac", "1", "-ar", "16000", "-b:a", "64k", &output,
        ])
        .env("PATH", extended_path())
        .output()
        .await?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "ffmpeg conversion failed (exit {}): {}",
            result.status.code().unwrap_or(-1),
            stderr
        )));
    }

    Ok(())
}
