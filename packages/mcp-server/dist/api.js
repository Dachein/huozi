const BASE_URL = process.env.HUOZI_BASE_URL || "https://huozi.app";
export async function apiCall(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
    };
    if (options.apiKey) {
        headers["Authorization"] = `Bearer ${options.apiKey}`;
    }
    else if (options.token) {
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
export function getApiKey() {
    return process.env.HUOZI_API_KEY;
}
