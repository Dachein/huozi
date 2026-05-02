/**
 * Password hashing & verification (Edge edition only at v1).
 *
 * Algorithm: PBKDF2-SHA-256 with 100,000 iterations.
 *
 * Why 100k specifically: Cloudflare Workers' WebCrypto runtime caps
 * PBKDF2 at 100,000 iterations — anything higher throws a
 * `NotSupportedError`. OWASP 2023 recommends 600k, but that's a
 * non-starter on this platform. 100k still beats NIST SP 800-63B's
 * "at least 10,000" bar by 10×, and combined with a 16-byte random
 * salt + 32-byte derived hash gives meaningful resistance against
 * offline cracking for the Edge self-host threat model (deployer-
 * controlled D1 leak).
 *
 * Encoded as a PHC-style string so future migrations to argon2id (via
 * a WASM bundle) can be transparent — `verifyPassword` dispatches by
 * the leading `$<algo>$` prefix, so old PBKDF2 hashes keep verifying
 * after a new algorithm lands. Upgrade path: SPEC §13.5.1.
 *
 * PHC string shape:
 *   $pbkdf2-sha256$i=100000$<base64url(salt)>$<base64url(hash)>
 */

const ALGO_ID = "pbkdf2-sha256";
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32; // 256 bits

/** Convert Uint8Array → unpadded base64url. */
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of b64url. Throws on bad input. */
function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const buf = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    key,
    bytes * 8,
  );
  return new Uint8Array(buf);
}

/**
 * Hash a plaintext password into a self-describing PHC string. Always
 * uses a fresh 16-byte salt; same input twice produces different
 * strings (which is correct — that's what salt is for).
 */
export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("password must be a non-empty string");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(plain, salt, ITERATIONS, HASH_BYTES);
  return `$${ALGO_ID}$i=${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

/**
 * Verify a plaintext password against a PHC string. Constant-time
 * compare on the derived hash. Returns false for any malformed input
 * (never throws) so callers can treat all failures uniformly.
 */
export async function verifyPassword(plain: string, phc: string): Promise<boolean> {
  if (typeof plain !== "string" || typeof phc !== "string") return false;

  // Parse `$<algo>$i=<iters>$<salt>$<hash>`. We only support pbkdf2-sha256
  // at v1; future algorithms add new branches here.
  const parts = phc.split("$");
  if (parts.length !== 5 || parts[0] !== "") return false;
  const [, algo, params, saltB64, hashB64] = parts as [string, string, string, string, string];
  if (algo !== ALGO_ID) return false;

  const m = params.match(/^i=(\d+)$/);
  if (!m) return false;
  const iters = Number(m[1]);
  if (!Number.isFinite(iters) || iters < 1 || iters > 5_000_000) return false;

  let storedSalt: Uint8Array;
  let storedHash: Uint8Array;
  try {
    storedSalt = fromB64url(saltB64);
    storedHash = fromB64url(hashB64);
  } catch {
    return false;
  }
  if (storedHash.length === 0) return false;

  const candidate = await pbkdf2(plain, storedSalt, iters, storedHash.length);
  return constantTimeEquals(candidate, storedHash);
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
