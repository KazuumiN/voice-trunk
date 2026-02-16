import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  ListPartsCommand,
  PutObjectCommand,
  GetObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../../types/env.js";

export function createR2Client(env: Env): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function presignPutUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number,
  contentType?: string,
): Promise<{ url: string; headers: Record<string, string> }> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return { url, headers };
}

export async function presignGetUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function createMultipartUpload(
  client: S3Client,
  bucket: string,
  key: string,
  contentType?: string,
): Promise<{ uploadId: string }> {
  const command = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  });
  const response = await client.send(command);
  if (!response.UploadId) {
    throw new Error("CreateMultipartUpload did not return an UploadId");
  }
  return { uploadId: response.UploadId };
}

export async function presignPartUrl(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn: number,
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function completeMultipartUpload(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  parts: { partNumber: number; eTag: string }[],
): Promise<void> {
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.eTag,
      })),
    },
  });
  await client.send(command);
}

export async function listParts(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
): Promise<{ partNumber: number; eTag: string; size: number }[]> {
  const command = new ListPartsCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
  });
  const response = await client.send(command);
  return (response.Parts ?? []).map((p) => ({
    partNumber: p.PartNumber!,
    eTag: p.ETag!,
    size: p.Size!,
  }));
}
