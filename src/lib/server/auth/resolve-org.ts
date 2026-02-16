import { generateId } from "../../utils/id.js";
import { HttpError } from "../../utils/response.js";
import { verifyAccessJwt } from "./verify-jwt.js";

export interface OrgContext {
  orgId: string;
  userId?: string;
  email?: string;
  actorType: "user" | "service_token";
}

/**
 * Auto-provision a user who authenticated via Cloudflare Access but has no DB record.
 * - If an org already exists, assign the user as 'member'.
 * - If no org exists, create a default org and assign the user as 'admin'.
 */
async function autoProvisionUser(
  db: D1Database,
  sub: string,
  email: string,
): Promise<{ id: string; orgId: string }> {
  let org = await db
    .prepare("SELECT id FROM orgs LIMIT 1")
    .first<{ id: string }>();

  let role: "admin" | "member" = "member";

  if (!org) {
    const orgId = generateId("org");
    await db
      .prepare(
        "INSERT INTO orgs (id, name, retentionDays) VALUES (?, ?, 365)",
      )
      .bind(orgId, "Default Organization")
      .run();
    org = { id: orgId };
    role = "admin";
  }

  const userId = generateId("usr");
  const displayName = email.split("@")[0];
  await db
    .prepare(
      "INSERT INTO users (id, orgId, accessSub, email, displayName, role) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(userId, org.id, sub, email, displayName, role)
    .run();

  return { id: userId, orgId: org.id };
}

export async function resolveOrg(
  request: Request,
  db: D1Database,
  teamDomain: string,
  aud: string,
): Promise<OrgContext> {
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  const serviceClientId = request.headers.get("Cf-Access-Client-Id");
  const serviceClientSecret = request.headers.get("Cf-Access-Client-Secret");

  if (jwt) {
    // Access JWT → user auth
    const payload = await verifyAccessJwt(jwt, teamDomain, aud);
    let user = await db
      .prepare("SELECT id, orgId FROM users WHERE accessSub = ?")
      .bind(payload.sub)
      .first<{ id: string; orgId: string }>();
    if (!user) {
      user = await autoProvisionUser(db, payload.sub, payload.email);
    }
    return {
      orgId: user.orgId,
      userId: user.id,
      email: payload.email,
      actorType: "user",
    };
  }

  if (serviceClientId && serviceClientSecret) {
    // Service Token auth
    const token = await db
      .prepare(
        "SELECT orgId FROM service_tokens WHERE clientId = ? AND clientSecret = ? AND revokedAt IS NULL",
      )
      .bind(serviceClientId, serviceClientSecret)
      .first<{ orgId: string }>();
    if (!token)
      throw new HttpError(401, "UNAUTHORIZED", "Invalid service token");
    return { orgId: token.orgId, actorType: "service_token" };
  }

  throw new HttpError(401, "UNAUTHORIZED", "No credentials provided");
}
