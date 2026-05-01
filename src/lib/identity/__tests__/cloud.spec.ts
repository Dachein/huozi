import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be declared before importing the module under test. We
// stub every transitive boundary the cloud impl reaches across:
//   - next/headers cookies()
//   - @/lib/auth/jwt verifySession + cookie-name constant
//   - @/lib/drive/admin admin endpoints (D1 reads via Worker)
//   - @/lib/drive/mcp-client cookie-name constant (re-used by connections)
//   - ./connections factory (kept opaque — we don't test it from here)

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
  }),
}));

vi.mock("@/lib/auth/jwt", () => ({
  SESSION_COOKIE_NAME: "huozi_session",
  verifySession: vi.fn(async (token: string) => {
    if (token === "valid-jwt-with-ws") {
      return { sub: "user_123", email: "alice@example.com", wsid: "ws_abc" };
    }
    if (token === "valid-jwt-no-ws") {
      return { sub: "user_no_ws", email: "noworkspace@example.com" };
    }
    return null;
  }),
}));

vi.mock("@/lib/drive/mcp-client", () => ({
  HUOZI_CLOUD_KEY_COOKIE: "huozi_key",
}));

vi.mock("@/lib/drive/admin", async () => {
  const actual: { slugToWorkspaceId: (slug: string) => string } = {
    slugToWorkspaceId: (slug: string) => `ws_${slug}`,
  };
  return {
    ...actual,
    cloudAdminListWorkspaces: vi.fn(async (opts: { id?: string }) => {
      if (opts.id === "ws_abc") {
        return [
          {
            id: "ws_abc",
            slug: "alice-co",
            name: "Alice Co",
            owner_id: "user_123",
            created_at: 1_700_000_000_000,
          },
        ];
      }
      return [];
    }),
    cloudAdminCheckSlug: vi.fn(async (slug: string) => slug !== "taken"),
    cloudAdminCreateWorkspace: vi.fn(async (input: { slug: string }) => {
      if (input.slug === "boom") {
        return { ok: false, error: "db_error", message: "D1 timeout" };
      }
      if (input.slug === "taken") {
        return { ok: false, error: "slug_taken" };
      }
      return {
        ok: true,
        workspace: {
          id: `ws_${input.slug}`,
          slug: input.slug,
          name: input.slug,
          owner_id: "user_123",
          created_at: 1_700_000_000_000,
        },
      };
    }),
    cloudAdminDeleteWorkspace: vi.fn(async () => undefined),
  };
});

vi.mock("../connections", () => ({
  createWorkerBackedConnections: () => ({
    listConnections: vi.fn(),
    insertConnection: vi.fn(),
    markConnectionRevoked: vi.fn(),
    ownsConnection: vi.fn(),
    formatMintName: (label: string, kind: string) => `[${kind}] ${label}`,
  }),
}));

import { createCloudIdentity } from "../cloud";

beforeEach(() => {
  cookieStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createCloudIdentity → getPrincipal", () => {
  it("returns null when there is no session cookie", async () => {
    const id = await createCloudIdentity();
    expect(await id.getPrincipal()).toBeNull();
  });

  it("returns null when the JWT is invalid", async () => {
    cookieStore.set("huozi_session", "garbage");
    const id = await createCloudIdentity();
    expect(await id.getPrincipal()).toBeNull();
  });

  it("returns a Principal with workspaceId when JWT has wsid", async () => {
    cookieStore.set("huozi_session", "valid-jwt-with-ws");
    const id = await createCloudIdentity();
    const p = await id.getPrincipal();
    expect(p).toEqual({
      userId: "user_123",
      email: "alice@example.com",
      displayLabel: "alice@example.com",
      isAdmin: false,
      workspaceId: "ws_abc",
    });
  });

  it("returns a Principal with null workspaceId when JWT has no wsid", async () => {
    cookieStore.set("huozi_session", "valid-jwt-no-ws");
    const id = await createCloudIdentity();
    const p = await id.getPrincipal();
    expect(p?.workspaceId).toBeNull();
    expect(p?.userId).toBe("user_no_ws");
  });
});

describe("createCloudIdentity → getPrimaryWorkspace", () => {
  it("returns null when not signed in", async () => {
    const id = await createCloudIdentity();
    expect(await id.getPrimaryWorkspace()).toBeNull();
  });

  it("returns null when JWT lacks wsid (multi-membership / unbound)", async () => {
    cookieStore.set("huozi_session", "valid-jwt-no-ws");
    const id = await createCloudIdentity();
    expect(await id.getPrimaryWorkspace()).toBeNull();
  });

  it("returns the bound workspace from D1 when wsid is set", async () => {
    cookieStore.set("huozi_session", "valid-jwt-with-ws");
    const id = await createCloudIdentity();
    const ws = await id.getPrimaryWorkspace();
    expect(ws).toMatchObject({
      id: "ws_abc",
      slug: "alice-co",
      name: "Alice Co",
      ownerId: "user_123",
    });
  });
});

describe("createCloudIdentity → isSlugAvailable", () => {
  it("rejects malformed slugs without hitting the network", async () => {
    cookieStore.set("huozi_session", "valid-jwt-with-ws");
    const id = await createCloudIdentity();
    expect(await id.isSlugAvailable("BadCaps")).toBe(false);
    expect(await id.isSlugAvailable("-leading-hyphen")).toBe(false);
    expect(await id.isSlugAvailable("ab")).toBe(false); // too short
  });

  it("delegates valid slugs to cloudAdminCheckSlug", async () => {
    const id = await createCloudIdentity();
    expect(await id.isSlugAvailable("fresh-slug")).toBe(true);
    expect(await id.isSlugAvailable("taken")).toBe(false);
  });
});

describe("createCloudIdentity → createWorkspace", () => {
  it("rejects unauthenticated callers", async () => {
    const id = await createCloudIdentity();
    const r = await id.createWorkspace({ slug: "x", name: "X" });
    expect(r).toEqual({ ok: false, error: "not_authenticated" });
  });

  it("rejects malformed slugs", async () => {
    cookieStore.set("huozi_session", "valid-jwt-with-ws");
    const id = await createCloudIdentity();
    const r = await id.createWorkspace({ slug: "Bad Slug", name: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("slug_format");
  });

  it("returns ok + workspace when admin endpoint succeeds", async () => {
    cookieStore.set("huozi_session", "valid-jwt-with-ws");
    const id = await createCloudIdentity();
    const r = await id.createWorkspace({ slug: "new-co", name: "New Co" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.workspace.slug).toBe("new-co");
      expect(r.workspace.ownerId).toBe("user_123");
    }
  });

  it("maps slug_taken from the worker to the same surface error", async () => {
    cookieStore.set("huozi_session", "valid-jwt-with-ws");
    const id = await createCloudIdentity();
    const r = await id.createWorkspace({ slug: "taken", name: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("slug_taken");
  });

  it("maps unknown errors from the worker to db_error", async () => {
    cookieStore.set("huozi_session", "valid-jwt-with-ws");
    const id = await createCloudIdentity();
    const r = await id.createWorkspace({ slug: "boom", name: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("db_error");
      expect(r.message).toBe("D1 timeout");
    }
  });
});
