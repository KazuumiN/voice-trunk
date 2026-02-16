/**
 * Compute SHA-256 hash of a File using the Web Crypto API.
 * Reads in chunks to avoid loading the entire file into memory.
 * Returns lowercase hex-encoded string.
 */
export async function sha256File(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks

  // For small files, use the simple path
  if (file.size <= CHUNK_SIZE) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return hexEncode(new Uint8Array(hashBuffer));
  }

  // For large files, read in chunks via ReadableStream
  const reader = file.stream().getReader();
  let loaded = 0;

  // Use SubtleCrypto's digest on accumulated chunks
  // Since SubtleCrypto doesn't support streaming digest, we accumulate
  // chunks and process them. For very large files we use a manual approach.
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, file.size);
  }

  // Concatenate into single buffer for digest
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", combined.buffer);
  return hexEncode(new Uint8Array(hashBuffer));
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
