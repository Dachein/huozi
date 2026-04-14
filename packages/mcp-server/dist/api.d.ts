interface ApiResponse {
    ok: boolean;
    status: number;
    data: Record<string, unknown>;
}
export declare function apiCall(path: string, options?: {
    method?: string;
    body?: Record<string, unknown>;
    token?: string;
    apiKey?: string;
}): Promise<ApiResponse>;
export declare function getApiKey(): string | undefined;
export {};
