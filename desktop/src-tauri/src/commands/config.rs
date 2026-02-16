use tauri_plugin_store::StoreExt;

use crate::config::{read_config, write_config, AppConfig};
use crate::error::AppError;

#[tauri::command]
pub async fn get_config() -> Result<AppConfig, AppError> {
    read_config().await
}

#[tauri::command]
pub async fn save_config(config: AppConfig) -> Result<(), AppError> {
    write_config(&config).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCredentials {
    pub client_id: String,
    pub client_secret: String,
}

#[tauri::command]
pub async fn get_auth_credentials(
    app: tauri::AppHandle,
) -> Result<AuthCredentials, AppError> {
    let store = app
        .store("credentials.json")
        .map_err(|e| AppError::Other(e.to_string()))?;

    let client_id = store
        .get("clientId")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    let client_secret = store
        .get("clientSecret")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    Ok(AuthCredentials {
        client_id,
        client_secret,
    })
}

#[tauri::command]
pub async fn save_auth_credentials(
    app: tauri::AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<(), AppError> {
    let store = app
        .store("credentials.json")
        .map_err(|e| AppError::Other(e.to_string()))?;

    store.set("clientId", serde_json::Value::String(client_id));
    store.set("clientSecret", serde_json::Value::String(client_secret));
    store
        .save()
        .map_err(|e| AppError::Other(e.to_string()))?;

    Ok(())
}
