import type { OrgScopedDb } from "./index.js";
import type { ProcessingRun, ProcessingRunStatus } from "../../types/index.js";
import { generateId } from "../../utils/id.js";
import { ID_PREFIX, ErrorCode } from "../../constants.js";
import { HttpError } from "../../utils/response.js";

export interface CreateProcessingRunInput {
  recordingId: string;
  provider: string;
  model: string;
  configJson?: string;
}

export async function create(
  scopedDb: OrgScopedDb,
  input: CreateProcessingRunInput,
): Promise<ProcessingRun> {
  const id = generateId(ID_PREFIX.processingRun);
  const now = new Date().toISOString();

  await scopedDb.run(
    `INSERT INTO processing_runs (id, recordingId, orgId, provider, model, configJson, status, completedSteps, retryCount, startedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', '[]', 0, ?)`,
    id,
    input.recordingId,
    scopedDb.orgId,
    input.provider,
    input.model,
    input.configJson ?? "{}",
    now,
  );

  return (await getById(scopedDb, id))!;
}

export async function getById(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<ProcessingRun | null> {
  return scopedDb.queryFirst<ProcessingRun>(
    `SELECT * FROM processing_runs WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}

export async function update(
  scopedDb: OrgScopedDb,
  id: string,
  fields: Partial<Pick<ProcessingRun, "status" | "finishedAt" | "error" | "retryCount">>,
): Promise<ProcessingRun> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    return (await getById(scopedDb, id))!;
  }

  params.push(id, scopedDb.orgId);

  await scopedDb.run(
    `UPDATE processing_runs SET ${setClauses.join(", ")} WHERE id = ? AND orgId = ?`,
    ...params,
  );

  return (await getById(scopedDb, id))!;
}

export async function addCompletedStep(
  scopedDb: OrgScopedDb,
  id: string,
  step: string,
): Promise<ProcessingRun> {
  const run = await getById(scopedDb, id);
  if (!run) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `Processing run ${id} not found`);
  }

  const steps: string[] = JSON.parse(run.completedSteps);
  if (!steps.includes(step)) {
    steps.push(step);
  }

  await scopedDb.run(
    `UPDATE processing_runs SET completedSteps = ? WHERE id = ? AND orgId = ?`,
    JSON.stringify(steps),
    id,
    scopedDb.orgId,
  );

  return (await getById(scopedDb, id))!;
}

export async function setFailed(
  scopedDb: OrgScopedDb,
  id: string,
  failedStep: string,
  error: string,
  status: "ERROR" | "PARTIAL" = "ERROR",
): Promise<ProcessingRun> {
  const now = new Date().toISOString();

  await scopedDb.run(
    `UPDATE processing_runs SET status = ?, failedStep = ?, error = ?, finishedAt = ?, retryCount = retryCount + 1
     WHERE id = ? AND orgId = ?`,
    status,
    failedStep,
    error,
    now,
    id,
    scopedDb.orgId,
  );

  return (await getById(scopedDb, id))!;
}
