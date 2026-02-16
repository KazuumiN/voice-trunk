import type { OrgScopedDb } from "./index.js";
import type { Device } from "../../types/index.js";

export async function list(scopedDb: OrgScopedDb): Promise<Device[]> {
  return scopedDb.queryAll<Device>(
    `SELECT * FROM devices WHERE orgId = ? ORDER BY label ASC`,
    scopedDb.orgId,
  );
}

export async function getById(
  scopedDb: OrgScopedDb,
  id: string,
): Promise<Device | null> {
  return scopedDb.queryFirst<Device>(
    `SELECT * FROM devices WHERE id = ? AND orgId = ?`,
    id,
    scopedDb.orgId,
  );
}
