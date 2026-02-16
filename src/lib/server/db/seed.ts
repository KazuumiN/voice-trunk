/**
 * Dev seed data for local development.
 * Run with: bun run src/lib/server/db/seed.ts
 *
 * For use with wrangler d1 execute or programmatic seeding.
 */

export const SEED_ORG_ID = "org-seed000001";
export const SEED_USER_ADMIN_ID = "usr-seedadmin01";
export const SEED_USER_MEMBER_ID = "usr-seedmembr01";
export const SEED_DEVICE_1_ID = "dev-seeddevice1";
export const SEED_DEVICE_2_ID = "dev-seeddevice2";
export const SEED_DEVICE_3_ID = "dev-seeddevice3";
export const SEED_WORKSHOP_ID = "ws-seedworkshp1";
export const SEED_BATCH_ID = "batch-seedbtch1";

export function getSeedStatements(): string[] {
  const now = "2026-02-15T00:00:00.000Z";

  return [
    // Org
    `INSERT OR IGNORE INTO orgs (id, name, retentionDays, createdAt)
     VALUES ('${SEED_ORG_ID}', 'Demo Organization', 365, '${now}')`,

    // Users
    `INSERT OR IGNORE INTO users (id, orgId, accessSub, email, displayName, role, createdAt)
     VALUES ('${SEED_USER_ADMIN_ID}', '${SEED_ORG_ID}', 'cf-access-admin-sub-001', 'admin@example.com', 'Admin User', 'admin', '${now}')`,

    `INSERT OR IGNORE INTO users (id, orgId, accessSub, email, displayName, role, createdAt)
     VALUES ('${SEED_USER_MEMBER_ID}', '${SEED_ORG_ID}', 'cf-access-member-sub-001', 'member@example.com', 'Member User', 'member', '${now}')`,

    // Devices
    `INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName, status, createdAt)
     VALUES ('${SEED_DEVICE_1_ID}', '${SEED_ORG_ID}', 'Table-1', 'RECORDER_ID.json', 'active', '${now}')`,

    `INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName, status, createdAt)
     VALUES ('${SEED_DEVICE_2_ID}', '${SEED_ORG_ID}', 'Table-2', 'RECORDER_ID.json', 'active', '${now}')`,

    `INSERT OR IGNORE INTO devices (id, orgId, label, expectedIdentifierFileName, status, createdAt)
     VALUES ('${SEED_DEVICE_3_ID}', '${SEED_ORG_ID}', 'Table-3', 'RECORDER_ID.json', 'inactive', '${now}')`,

    // Workshop
    `INSERT OR IGNORE INTO workshops (id, orgId, title, date, location, agendaR2Key, createdBy, createdAt)
     VALUES ('${SEED_WORKSHOP_ID}', '${SEED_ORG_ID}', 'Community Workshop 2026-02', '2026-02-15', 'City Hall Room A', NULL, '${SEED_USER_ADMIN_ID}', '${now}')`,

    // Import Batch
    `INSERT OR IGNORE INTO import_batches (id, orgId, createdBy, startedAt, endedAt, notes, status, totalFiles, uploadedFiles, errorFiles)
     VALUES ('${SEED_BATCH_ID}', '${SEED_ORG_ID}', '${SEED_USER_ADMIN_ID}', '${now}', NULL, 'Initial test batch', 'OPEN', 3, 0, 0)`,
  ];
}

/**
 * Execute seed data against a D1 database.
 */
export async function seed(db: D1Database): Promise<void> {
  const statements = getSeedStatements();
  const prepared = statements.map((sql) => db.prepare(sql));
  await db.batch(prepared);
  console.log(`Seeded ${statements.length} records.`);
}
