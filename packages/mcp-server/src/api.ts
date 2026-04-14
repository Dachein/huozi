const BASE_URL = process.env.HUOZI_BASE_URL || "https://huozi.app";

interface ApiResponse {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

export async function apiCall(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    token?: string;
    apiKey?: string;
  } = {}
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.apiKey) {
    headers["Authorization"] = `Bearer ${options.apiKey}`;
  } else if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export function getApiKey(): string | undefined {
  return process.env.HUOZI_API_KEY;
}
