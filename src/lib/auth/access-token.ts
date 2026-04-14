async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateRandomToken(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    result += chars[b % chars.length];
  }
  return result;
}

export async function hashAccessToken(
  token: string
): Promise<{ hash: string; hint: string }> {
  const hash = await sha256(token);
  const hint = token.slice(-2);
  return { hash, hint };
}

export async function verifyAccessToken(
  token: string,
  hash: string
): Promise<boolean> {
  const tokenHash = await sha256(token);
  return tokenHash === hash;
}
