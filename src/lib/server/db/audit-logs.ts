import type { OrgScopedDb } from "./index.js";
import type { ActorType } from "../../types/index.js";
import { generateId } from "../../utils/id.js";
import { ID_PREFIX } from "../../constants.js";

export interface LogActionInput {
  actorType: ActorType;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  ip?: string | null;
  ua?: string | null;
}

export async function logAction(
  scopedDb: OrgScopedDb,
  input: LogActionInput,
): Promise<void> {
  const id = generateId(ID_PREFIX.auditLog);
  const now = new Date().toISOString();

  await scopedDb.run(
    `INSERT INTO audit_logs (id, orgId, actorType, actorId, action, targetType, targetId, ip, ua, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    scopedDb.orgId,
    input.actorType,
    input.actorId,
    input.action,
    input.targetType,
    input.targetId,
    input.ip ?? null,
    input.ua ?? null,
    now,
  );
}
