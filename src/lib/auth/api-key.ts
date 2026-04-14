import { createAdminClient } from "@/lib/supabase/admin";

export interface ApiKeyAuth {
  workspaceId: string;
  keyId: string;
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function validateApiKey(
  request: Request
): Promise<ApiKeyAuth | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token.startsWith("hz_")) return null;

  const keyHash = await sha256(token);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, workspace_id")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !data) return null;

  // Update last_used_at in background
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return {
    workspaceId: data.workspace_id,
    keyId: data.id,
  };
}

export function generateApiKey(): { raw: string; hash: Promise<string>; prefix: string } {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const raw = `hz_${hex}`;
  return {
    raw,
    hash: sha256(raw),
    prefix: raw.slice(0, 11), // "hz_" + 8 chars
  };
}
