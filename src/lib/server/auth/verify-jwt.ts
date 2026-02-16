/**
 * Cloudflare Access JWT verification using JWKS.
 */

interface JwtPayload {
  sub: string;
  email: string;
  iss: string;
  aud: string[];
  exp: number;
  iat: number;
}

// Cache JWKS keys in memory (per-isolate)
let cachedKeys: Map<string, CryptoKey> | null = null;
let cachedKeysExpiry = 0;

async function fetchJwks(
  teamDomain: string,
): Promise<Map<string, CryptoKey>> {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch JWKS: ${resp.status}`);

  const data = (await resp.json()) as {
    keys: Array<{
      kid: string;
      kty: string;
      alg: string;
      n: string;
      e: string;
      use: string;
    }>;
  };

  const keys = new Map<string, CryptoKey>();
  for (const jwk of data.keys) {
    if (jwk.use === "sig" && jwk.kty === "RSA") {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      keys.set(jwk.kid, key);
    }
  }
  return keys;
}

async function getKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (cachedKeys && now < cachedKeysExpiry) return cachedKeys;
  cachedKeys = await fetchJwks(teamDomain);
  cachedKeysExpiry = now + 5 * 60 * 1000; // 5 min cache
  return cachedKeys;
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const [headerB64, payloadB64, signatureB64] = parts;
  const headerJson = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(headerB64)),
  );
  const payload: JwtPayload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payloadB64)),
  );

  // Validate claims
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("Token expired");
  if (!payload.aud.includes(aud)) throw new Error("Invalid audience");
  if (payload.iss !== `https://${teamDomain}`)
    throw new Error("Invalid issuer");

  // Verify signature
  const keys = await getKeys(teamDomain);
  const kid = headerJson.kid;
  const key = keys.get(kid);
  if (!key) {
    // Try refreshing keys once
    cachedKeys = null;
    const refreshed = await getKeys(teamDomain);
    const retryKey = refreshed.get(kid);
    if (!retryKey) throw new Error("Unknown signing key");
  }

  const signingKey = (await getKeys(teamDomain)).get(kid)!;
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    signature,
    data,
  );
  if (!valid) throw new Error("Invalid signature");

  return payload;
}
