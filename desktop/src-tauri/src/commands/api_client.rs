use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct AuthHeaders {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightFile {
    pub device_id: String,
    pub original_file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recorder_file_created_at: Option<String>,
    pub size_bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightResult {
    pub sha256: String,
    pub status: String, // "ALREADY_EXISTS" | "NEW"
    pub recording_id: String,
    pub upload_id: Option<String>,
    pub raw_r2_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreflightBatchResponse {
    #[allow(dead_code)]
    pub batch_id: String,
    pub results: Vec<PreflightResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreflightBatchRequest {
    batch_id: String,
    files: Vec<PreflightFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresignRequest {
    upload_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    expires_in_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    multipart: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignResult {
    pub method: String,
    pub url: String,
    pub headers: std::collections::HashMap<String, String>,
    pub upload_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresignPartRequest {
    upload_id: String,
    part_number: u32,
}

#[derive(Debug, Deserialize)]
struct PresignPartResponse {
    url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedPart {
    pub part_number: u32,
    pub etag: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompleteMultipartRequest {
    upload_id: String,
    parts: Vec<CompletedPart>,
}

fn build_client(auth: &AuthHeaders) -> Result<Client, AppError> {
    let mut headers = reqwest::header::HeaderMap::new();
    if !auth.client_id.is_empty() {
        headers.insert(
            "Cf-Access-Client-Id",
            auth.client_id.parse().map_err(|_| {
                AppError::InvalidInput("Invalid client_id header value".into())
            })?,
        );
        headers.insert(
            "Cf-Access-Client-Secret",
            auth.client_secret.parse().map_err(|_| {
                AppError::InvalidInput("Invalid client_secret header value".into())
            })?,
        );
    }

    Client::builder()
        .default_headers(headers)
        .build()
        .map_err(AppError::Http)
}

async fn check_response(res: reqwest::Response, context: &str) -> Result<reqwest::Response, AppError> {
    if !res.status().is_success() {
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: format!("{}: {}", context, text),
        });
    }
    Ok(res)
}

pub async fn preflight_batch(
    server_url: String,
    auth: AuthHeaders,
    batch_id: String,
    files: Vec<PreflightFile>,
) -> Result<Vec<PreflightResult>, AppError> {
    let client = build_client(&auth)?;
    let url = format!("{}/api/v1/recordings/preflight-batch", server_url.trim_end_matches('/'));

    let body = PreflightBatchRequest { batch_id, files };
    let res = client.post(&url).json(&body).send().await?;
    let res = check_response(res, "preflight-batch").await?;
    let response: PreflightBatchResponse = res.json().await?;

    Ok(response.results)
}

pub async fn presign(
    server_url: String,
    auth: AuthHeaders,
    recording_id: String,
    upload_id: String,
    multipart: Option<bool>,
) -> Result<PresignResult, AppError> {
    let client = build_client(&auth)?;
    let url = format!(
        "{}/api/v1/recordings/{}/presign",
        server_url.trim_end_matches('/'),
        recording_id
    );

    let body = PresignRequest {
        upload_id,
        expires_in_seconds: None,
        multipart,
    };
    let res = client.post(&url).json(&body).send().await?;
    let res = check_response(res, "presign").await?;

    Ok(res.json().await?)
}

pub async fn presign_part(
    server_url: String,
    auth: AuthHeaders,
    recording_id: String,
    upload_id: String,
    part_number: u32,
) -> Result<String, AppError> {
    let client = build_client(&auth)?;
    let url = format!(
        "{}/api/v1/recordings/{}/presign-part",
        server_url.trim_end_matches('/'),
        recording_id
    );

    let body = PresignPartRequest {
        upload_id,
        part_number,
    };
    let res = client.post(&url).json(&body).send().await?;
    let res = check_response(res, "presign-part").await?;
    let response: PresignPartResponse = res.json().await?;

    Ok(response.url)
}

pub async fn complete_multipart(
    server_url: String,
    auth: AuthHeaders,
    recording_id: String,
    upload_id: String,
    parts: Vec<CompletedPart>,
) -> Result<(), AppError> {
    let client = build_client(&auth)?;
    let url = format!(
        "{}/api/v1/recordings/{}/complete-multipart",
        server_url.trim_end_matches('/'),
        recording_id
    );

    let body = CompleteMultipartRequest { upload_id, parts };
    let res = client.post(&url).json(&body).send().await?;
    check_response(res, "complete-multipart").await?;

    Ok(())
}

#[allow(dead_code)]
pub async fn complete_upload(
    server_url: String,
    auth: AuthHeaders,
    recording_id: String,
) -> Result<(), AppError> {
    let client = build_client(&auth)?;
    let url = format!(
        "{}/api/v1/recordings/{}/complete",
        server_url.trim_end_matches('/'),
        recording_id
    );

    let res = client.post(&url).send().await?;
    check_response(res, "complete-upload").await?;

    Ok(())
}

// Implement Deserialize for AuthHeaders so it can be used in Tauri commands
impl<'de> Deserialize<'de> for AuthHeaders {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Helper {
            client_id: String,
            client_secret: String,
        }

        let helper = Helper::deserialize(deserializer)?;
        Ok(AuthHeaders {
            client_id: helper.client_id,
            client_secret: helper.client_secret,
        })
    }
}

impl Serialize for AuthHeaders {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AuthHeaders", 2)?;
        state.serialize_field("clientId", &self.client_id)?;
        state.serialize_field("clientSecret", &self.client_secret)?;
        state.end()
    }
}
