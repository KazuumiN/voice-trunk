export interface PreflightFile {
  deviceId: string;
  originalFileName: string;
  recorderFileCreatedAt?: string;
  sizeBytes: number;
  sha256: string;
}

export interface PreflightResult {
  sha256: string;
  status: "ALREADY_EXISTS" | "NEW";
  recordingId: string;
  uploadId?: string;
  rawR2Key?: string;
}

export interface PresignResult {
  method: string;
  url: string;
  headers: Record<string, string>;
  uploadId?: string; // multipart upload ID
}

export interface RecordingInfo {
  recordingId: string;
  status: string;
  uploadId?: string;
  workshopId?: string;
  artifacts?: { type: string; r2Key: string }[];
}

export class ImporterApiClient {
  private serverUrl: string;
  private authHeaders: Record<string, string>;

  constructor(serverUrl: string, authHeaders: Record<string, string>) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.authHeaders = authHeaders;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.serverUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async preflightBatch(
    batchId: string,
    files: PreflightFile[],
  ): Promise<PreflightResult[]> {
    const result = await this.request<{ batchId: string; results: PreflightResult[] }>(
      "POST",
      "/recordings/preflight-batch",
      { batchId, files },
    );
    return result.results;
  }

  async presign(
    recordingId: string,
    opts: { uploadId: string; expiresInSeconds?: number; multipart?: boolean },
  ): Promise<PresignResult> {
    return this.request<PresignResult>(
      "POST",
      `/recordings/${recordingId}/presign`,
      opts,
    );
  }

  async presignPart(
    recordingId: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    const result = await this.request<{ url: string }>(
      "POST",
      `/recordings/${recordingId}/presign-part`,
      { uploadId, partNumber },
    );
    return result.url;
  }

  async completeMultipart(
    recordingId: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    await this.request(
      "POST",
      `/recordings/${recordingId}/complete-multipart`,
      { uploadId, parts },
    );
  }

  async getRecordingStatus(recordingId: string): Promise<RecordingInfo> {
    return this.request<RecordingInfo>(
      "GET",
      `/recordings/${recordingId}`,
    );
  }
}
