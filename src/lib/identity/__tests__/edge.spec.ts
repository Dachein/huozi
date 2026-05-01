import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
  }),
}));

vi.mock("@/lib/edition", () => ({
  getEdgeWorkspaceSlug: () => "default",
  getEdgeWorkspaceName: () => "Edge Workspace",
}));

vi.mock("@/lib/drive/admin", () => ({
  slugToWorkspaceId: (slug: string) => `ws_${slug}`,
}));

vi.mock("@/lib/drive/mcp-client", () => ({
  HUOZI_CLOUD_KEY_COOKIE: "huozi_key",
}));

vi.mock("@/lib/identity/connections", () => ({
  createWorkerBackedConnections: () => ({
    listConnections: vi.fn(),
    insertConnection: vi.fn(),
    markConnectionRevoked: vi.fn(),
    ownsConnection: vi.fn(),
    formatMintName: (label: string, kind: string) => `[${kind}] ${label}`,
  }),
}));

import { createEdgeIdentity } from "../edge";

beforeEach(() => {
  cookieStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createEdgeIdentity → getPrincipal", () => {
  it("returns null when no api-key cookie is set", async () => {
    const id = await createEdgeIdentity();
    expect(await id.getPrincipal()).toBeNull();
  });

  it("returns null when cookie value doesn't look like an api key", async () => {
    cookieStore.set("huozi_key", "not-a-key");
    const id = await createEdgeIdentity();
    expect(await id.getPrincipal()).toBeNull();
  });

  it("returns the fixed admin principal when api key cookie is valid", async () => {
    cookieStore.set("huozi_key", "hz_abc123");
    const id = await createEdgeIdentity();
    const p = await id.getPrincipal();
    expect(p).toEqual({
      userId: "admin",
      displayLabel: "admin",
      isAdmin: true,
      workspaceId: "ws_default",
    });
  });
});

describe("createEdgeIdentity → getPrimaryWorkspace", () => {
  it("returns null when no api-key cookie is set", async () => {
    const id = await createEdgeIdentity();
    expect(await id.getPrimaryWorkspace()).toBeNull();
  });

  it("returns the configured fixed workspace when authenticated", async () => {
    cookieStore.set("huozi_key", "hz_abc123");
    const id = await createEdgeIdentity();
    const ws = await id.getPrimaryWorkspace();
    expect(ws).toMatchObject({
      id: "ws_default",
      slug: "default",
      name: "Edge Workspace",
      ownerId: "admin",
    });
  });
});

describe("createEdgeIdentity → write paths are no-ops", () => {
  it("isSlugAvailable always returns false (single-workspace world)", async () => {
    const id = await createEdgeIdentity();
    expect(await id.isSlugAvailable("anything")).toBe(false);
    expect(await id.isSlugAvailable("default")).toBe(false);
  });

  it("createWorkspace fails with a deploy-time-config explanation", async () => {
    const id = await createEdgeIdentity();
    const r = await id.createWorkspace({ slug: "x", name: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("slug_taken");
      expect(r.message).toContain("HUOZI_EDGE_WORKSPACE_SLUG");
    }
  });

  it("deleteWorkspace silently no-ops", async () => {
    const id = await createEdgeIdentity();
    await expect(id.deleteWorkspace("anything")).resolves.toBeUndefined();
  });
});
