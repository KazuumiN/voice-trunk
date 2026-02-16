import { stat } from "node:fs/promises";
import { type ImporterApiClient, type PresignResult } from "./api-client.js";
import { updateFileStatus, readState, writeState } from "./state.js";

const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
const PART_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CONCURRENT_PARTS = 4;

export async function uploadFile(
  apiClient: ImporterApiClient,
  filePath: string,
  recordingId: string,
  batchId: string,
  sha256: string,
  presignResult: PresignResult,
): Promise<void> {
  const fileInfo = await stat(filePath);

  if (fileInfo.size > MULTIPART_THRESHOLD && presignResult.uploadId) {
    await uploadMultipart(apiClient, filePath, recordingId, presignResult.uploadId, batchId, sha256);
  } else {
    await uploadSingle(filePath, presignResult);
    await updateFileStatus(batchId, sha256, { uploaded: true });
  }
}

async function uploadSingle(
  filePath: string,
  presignResult: PresignResult,
): Promise<void> {
  const file = Bun.file(filePath);
  const res = await fetch(presignResult.url, {
    method: presignResult.method,
    headers: presignResult.headers,
    body: file,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
}

async function uploadMultipart(
  apiClient: ImporterApiClient,
  filePath: string,
  recordingId: string,
  uploadId: string,
  batchId: string,
  sha256: string,
): Promise<void> {
  const file = Bun.file(filePath);
  const fileSize = file.size;
  const totalParts = Math.ceil(fileSize / PART_SIZE);

  // Load previously completed parts from state for resume
  const state = await readState();
  const batch = state.batches[batchId];
  const fileState = batch?.files[sha256];
  const completedParts = new Set(fileState?.completedParts ?? []);

  // Save multipart upload ID to state for resume
  if (fileState && !fileState.multipartUploadId) {
    await updateFileStatus(batchId, sha256, { multipartUploadId: uploadId });
  }

  const allParts: { partNumber: number; etag: string }[] = [];

  // Upload parts with limited concurrency
  const pendingParts: number[] = [];
  for (let i = 1; i <= totalParts; i++) {
    if (!completedParts.has(i)) {
      pendingParts.push(i);
    }
  }

  // Process in batches of MAX_CONCURRENT_PARTS
  for (let i = 0; i < pendingParts.length; i += MAX_CONCURRENT_PARTS) {
    const batch = pendingParts.slice(i, i + MAX_CONCURRENT_PARTS);
    const results = await Promise.all(
      batch.map(async (partNumber) => {
        const start = (partNumber - 1) * PART_SIZE;
        const end = Math.min(start + PART_SIZE, fileSize);
        const partBlob = file.slice(start, end);

        const presignedUrl = await apiClient.presignPart(recordingId, uploadId, partNumber);

        const res = await fetch(presignedUrl, {
          method: "PUT",
          body: partBlob,
        });

        if (!res.ok) {
          throw new Error(`Part ${partNumber} upload failed (${res.status})`);
        }

        const etag = res.headers.get("etag");
        if (!etag) {
          throw new Error(
            `Part ${partNumber} upload succeeded but response missing ETag header. ` +
              `Cannot complete multipart upload without ETags.`,
          );
        }

        // Save progress
        const currentState = await readState();
        const currentBatch = currentState.batches[batchId];
        const currentFile = currentBatch?.files[sha256];
        if (currentFile) {
          const parts = new Set(currentFile.completedParts ?? []);
          parts.add(partNumber);
          await updateFileStatus(batchId, sha256, {
            completedParts: Array.from(parts),
          });
        }

        return { partNumber, etag };
      }),
    );
    allParts.push(...results);
  }

  // Complete multipart upload
  const sortedParts = allParts.sort((a, b) => a.partNumber - b.partNumber);
  await apiClient.completeMultipart(recordingId, uploadId, sortedParts);
  await updateFileStatus(batchId, sha256, { uploaded: true });
}
