import type { OrgScopedDb } from "./index.js";
import type { GeminiSemaphore } from "../../types/index.js";
import { generateId } from "../../utils/id.js";

/**
 * Acquire a semaphore slot for Gemini API concurrency control.
 * Returns the semaphore record if acquired, or null if max concurrent reached.
 */
export async function acquire(
  scopedDb: OrgScopedDb,
  acquiredBy: string,
  maxConcurrent: number,
  ttlSeconds: number = 300,
): Promise<GeminiSemaphore | null> {
  // Clean expired first
  await cleanExpired(scopedDb);

  const activeCount = await countActive(scopedDb);
  if (activeCount >= maxConcurrent) {
    return null;
  }

  const id = generateId("sem");
  const now = new Date();
  const acquiredAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  await scopedDb.run(
    `INSERT INTO gemini_semaphore (id, orgId, acquiredBy, acquiredAt, expiresAt)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    scopedDb.orgId,
    acquiredBy,
    acquiredAt,
    expiresAt,
  );

  return scopedDb.queryFirst<GeminiSemaphore>(
    `SELECT * FROM gemini_semaphore WHERE id = ?`,
    id,
  );
}

/**
 * Release a semaphore slot by deleting it.
 */
export async function release(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<void> {
  await scopedDb.run(
    `DELETE FROM gemini_semaphore WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}

/**
 * Clean up expired semaphore entries.
 */
export async function cleanExpired(scopedDb: OrgScopedDb): Promise<void> {
  const now = new Date().toISOString();
  await scopedDb.run(
    `DELETE FROM gemini_semaphore WHERE orgId = ? AND expiresAt < ?`,
    scopedDb.orgId,
    now,
  );
}

/**
 * Count active (non-expired) semaphore entries for the org.
 */
export async function countActive(scopedDb: OrgScopedDb): Promise<number> {
  const now = new Date().toISOString();
  const result = await scopedDb.queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM gemini_semaphore WHERE orgId = ? AND expiresAt >= ?`,
    scopedDb.orgId,
    now,
  );
  return result?.count ?? 0;
}
