export interface MountInfo {
  path: string;
  name: string;
  hasRecorderId: boolean;
}

export interface RecorderIdentifier {
  deviceId: string;
  label: string;
  orgIdHint?: string;
  notes?: string;
}

export interface AppConfig {
  serverUrl: string;
  maxStorageGb: number;
  ffmpegPath: string;
  autoImport: boolean;
  autoStart: boolean;
  watchIntervalMs: number;
}

export type BatchStatus = "OPEN" | "UPLOADING" | "COMPLETED" | "PARTIAL_ERROR";

export interface BatchState {
  status: BatchStatus;
  deviceId: string;
  files: Record<string, FileStatus>;
}

export interface FileStatus {
  recordingId: string;
  uploaded: boolean;
  error?: string;
  uploadId?: string;
  rawR2Key?: string;
  completedParts?: number[];
  multipartUploadId?: string;
}

export interface ImportProgress {
  batchId: string;
  phase: string;
  current: number;
  total: number;
  fileName?: string;
  message?: string;
}

export interface HashProgress {
  fileName: string;
  bytesHashed: number;
  totalBytes: number;
}

export interface UploadProgress {
  recordingId: string;
  fileName: string;
  bytesUploaded: number;
  totalBytes: number;
  partNumber?: number;
  totalParts?: number;
}

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  modified: number;
}

export interface ManualUploadFile {
  path: string;
  name: string;
  sizeBytes: number;
}
