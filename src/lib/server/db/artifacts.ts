import type { OrgScopedDb } from "./index.js";
import type { Artifact, ArtifactType } from "../../types/index.js";
import { generateId } from "../../utils/id.js";
import { ID_PREFIX } from "../../constants.js";

export interface CreateArtifactInput {
  runId: string;
  type: ArtifactType;
  r2Key: string;
  contentHash?: string | null;
}

export async function create(
  scopedDb: OrgScopedDb,
  input: CreateArtifactInput,
): Promise<Artifact> {
  const id = generateId(ID_PREFIX.artifact);
  const now = new Date().toISOString();

  await scopedDb.run(
    `INSERT INTO artifacts (id, runId, orgId, type, r2Key, contentHash, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.runId,
    scopedDb.orgId,
    input.type,
    input.r2Key,
    input.contentHash ?? null,
    now,
  );

  return (await getById(scopedDb, id))!;
}

async function getById(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<Artifact | null> {
  return scopedDb.queryFirst<Artifact>(
    `SELECT * FROM artifacts WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}

export async function listByRunId(
  scopedDb: OrgScopedDb,
  runId: string,
): Promise<Artifact[]> {
  return scopedDb.queryAll<Artifact>(
    `SELECT * FROM artifacts WHERE runId = ? AND orgId = ? ORDER BY createdAt ASC`,
    runId,
    scopedDb.orgId,
  );
}
