import type {
  PaginatedResponse,
  Recording,
  Workshop,
  WorkshopDraft,
  ImportBatch,
  Device,
  ApiError,
} from "$lib/types/index.js";

const API_BASE = "/api/v1";

class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiClientError(
      res.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? res.statusText,
    );
  }

  return res.json() as Promise<T>;
}

// ----- Devices -----

export function getDevices() {
  return fetchApi<{ devices: Array<{ deviceId: string; label: string; identifierFileName: string; status: string }> }>(
    "/devices",
  );
}

// ----- Upload / Preflight -----

export interface PreflightBatchFile {
  deviceId?: string | null;
  originalFileName: string;
  recorderFileCreatedAt?: string | null;
  sizeBytes: number;
  sha256: string;
}

export interface PreflightBatchResult {
  batchId: string;
  results: Array<{
    sha256: string;
    status: "ALREADY_EXISTS" | "NEW";
    recordingId: string;
    uploadId?: string;
    rawR2Key?: string;
  }>;
}

export function preflightBatch(files: PreflightBatchFile[], batchId?: string) {
  return fetchApi<PreflightBatchResult>("/recordings/preflight-batch", {
    method: "POST",
    body: JSON.stringify({ files, batchId }),
  });
}

export interface PresignResponse {
  method: "PUT" | "MULTIPART";
  url?: string;
  headers?: Record<string, string>;
  uploadId?: string;
  key?: string;
}

export function presignUpload(recordingId: string, options?: { multipart?: boolean }) {
  return fetchApi<PresignResponse>(
    `/recordings/${recordingId}/presign`,
    {
      method: "POST",
      body: JSON.stringify({ multipart: options?.multipart ?? false }),
    },
  );
}

export function presignPart(recordingId: string, uploadId: string, partNumber: number) {
  return fetchApi<{ url: string; partNumber: number }>(
    `/recordings/${recordingId}/presign-part`,
    {
      method: "POST",
      body: JSON.stringify({ uploadId, partNumber }),
    },
  );
}

export function completeMultipart(
  recordingId: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
) {
  return fetchApi<{ status: string }>(
    `/recordings/${recordingId}/complete-multipart`,
    {
      method: "POST",
      body: JSON.stringify({ uploadId, parts }),
    },
  );
}

// ----- Recordings -----

interface RecordingListParams {
  limit?: number;
  cursor?: string;
  sort?: string;
  status?: string;
  workshopId?: string;
  deviceId?: string;
  batchId?: string;
  draftId?: string;
}

export function getRecordings(params: RecordingListParams = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.sort) q.set("sort", params.sort);
  if (params.status) q.set("status", params.status);
  if (params.workshopId) q.set("workshopId", params.workshopId);
  if (params.deviceId) q.set("deviceId", params.deviceId);
  if (params.batchId) q.set("batchId", params.batchId);
  if (params.draftId) q.set("draftId", params.draftId);
  const qs = q.toString();
  return fetchApi<PaginatedResponse<Recording>>(
    `/recordings${qs ? `?${qs}` : ""}`,
  );
}

export function getRecording(id: string) {
  return fetchApi<
    Recording & {
      latestRun: {
        id: string;
        status: string;
        completedSteps: string[];
        failedStep: string | null;
        error: string | null;
        provider: string;
        model: string;
        startedAt: string;
        finishedAt: string | null;
      } | null;
      artifacts: Array<{ id: string; type: string; r2Key: string }>;
      chunks: Array<{ id: string; chunkIndex: number; startMs: number; endMs: number }>;
    }
  >(`/recordings/${id}`);
}

export function reprocessRecording(
  id: string,
  body: { provider?: string; model?: string; options?: Record<string, unknown>; fromStep?: string },
) {
  return fetchApi<{ runId: string; status: string }>(`/recordings/${id}/reprocess`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getRecordingPresignUrl(id: string) {
  return fetchApi<{ url: string; expiresAt: string }>(`/recordings/${id}/presign`);
}

// ----- Workshops -----

interface WorkshopListParams {
  limit?: number;
  cursor?: string;
  sort?: string;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  title?: string;
}

export function getWorkshops(params: WorkshopListParams = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.sort) q.set("sort", params.sort);
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.location) q.set("location", params.location);
  if (params.title) q.set("title", params.title);
  const qs = q.toString();
  return fetchApi<PaginatedResponse<Workshop>>(
    `/workshops${qs ? `?${qs}` : ""}`,
  );
}

export function getWorkshop(id: string) {
  return fetchApi<Workshop>(`/workshops/${id}`);
}

export function createWorkshop(body: { title: string; date: string; location: string }) {
  return fetchApi<Workshop>("/workshops", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function exportWorkshop(id: string) {
  return fetchApi<{
    workshopId: string;
    title: string;
    recordingCount: number;
    artifacts: Array<{ recordingId: string; type: string; r2Key: string }>;
  }>(`/workshops/${id}/export`, { method: "POST" });
}

// ----- Workshop Drafts -----

interface DraftListParams {
  limit?: number;
  cursor?: string;
  sort?: string;
  status?: string;
  importBatchId?: string;
}

export function getWorkshopDraft(id: string) {
  return fetchApi<WorkshopDraft>(`/workshop_drafts/${id}`);
}

export function getWorkshopDrafts(params: DraftListParams = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.sort) q.set("sort", params.sort);
  if (params.status) q.set("status", params.status);
  if (params.importBatchId) q.set("importBatchId", params.importBatchId);
  const qs = q.toString();
  return fetchApi<PaginatedResponse<WorkshopDraft>>(
    `/workshop_drafts${qs ? `?${qs}` : ""}`,
  );
}

export function confirmDraft(
  id: string,
  body: { title: string; date: string; location: string },
) {
  return fetchApi<{ workshopId: string; draftId: string; status: string }>(
    `/workshop_drafts/${id}/confirm`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// ----- Import Batches -----

interface BatchListParams {
  limit?: number;
  cursor?: string;
  sort?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function getImportBatches(params: BatchListParams = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.sort) q.set("sort", params.sort);
  if (params.status) q.set("status", params.status);
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  const qs = q.toString();
  return fetchApi<PaginatedResponse<ImportBatch>>(
    `/import_batches${qs ? `?${qs}` : ""}`,
  );
}

// ----- Service Tokens -----

export interface ServiceToken {
  id: string;
  label: string;
  clientId: string;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface ServiceTokenCreated {
  id: string;
  label: string;
  clientId: string;
  clientSecret: string;
}

export function getServiceTokens() {
  return fetchApi<{ tokens: ServiceToken[] }>("/service-tokens");
}

export function createServiceToken(label: string) {
  return fetchApi<ServiceTokenCreated>("/service-tokens", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function revokeServiceToken(id: string) {
  return fetchApi<{ id: string; revoked: boolean }>(`/service-tokens/${id}`, {
    method: "DELETE",
  });
}
