import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Config {
  maxStorageGB: number;
  serverUrl: string;
  authMode: "service_token" | "user";
  clientId?: string;
  clientSecret?: string;
}

const DEFAULT_CONFIG: Config = {
  maxStorageGB: 50,
  serverUrl: "http://localhost:8787",
  authMode: "service_token",
};

export function getBasePath(): string {
  return join(homedir(), "Library", "Application Support", "voice-trunk");
}

function getConfigPath(): string {
  return join(getBasePath(), "config.json");
}

export async function readConfig(): Promise<Config> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<Config>;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
  };
}

export async function writeConfig(config: Config): Promise<void> {
  const basePath = getBasePath();
  await mkdir(basePath, { recursive: true });
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
