import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export async function copyWithHash(src: string, dest: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  const read = createReadStream(src);
  const write = createWriteStream(dest);

  read.on("data", (chunk: Buffer) => {
    hasher.update(chunk);
  });

  await pipeline(read, write);
  return hasher.digest("hex");
}

export async function hashFile(path: string): Promise<string> {
  const file = Bun.file(path);
  const hasher = new Bun.CryptoHasher("sha256");
  const stream = file.stream();

  for await (const chunk of stream) {
    hasher.update(chunk);
  }

  return hasher.digest("hex");
}
