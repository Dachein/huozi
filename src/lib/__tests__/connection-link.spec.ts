import { describe, expect, it } from "vitest";
import {
  buildMcpSnippet,
  decodeConnectionLink,
  encodeConnectionLink,
  type ConnectionLinkPayload,
} from "../connection-link";

const sample: ConnectionLinkPayload = {
  v: 1,
  ep: "https://cloud.huozi.app",
  k: "hz_a1b2c3d4e5f6",
  ws: "alice",
  ed: "cloud",
};

describe("encode / decode round-trip", () => {
  it("round-trips a typical Cloud payload", () => {
    const link = encodeConnectionLink(sample);
    expect(link.startsWith("hz_link_")).toBe(true);
    expect(decodeConnectionLink(link)).toEqual(sample);
  });

  it("round-trips an Edge payload", () => {
    const edge: ConnectionLinkPayload = {
      v: 1,
      ep: "https://edge.example.com",
      k: "hz_xxxxxxxxxxxxxx",
      ws: "demo",
      ed: "edge",
    };
    const link = encodeConnectionLink(edge);
    expect(decodeConnectionLink(link)).toEqual(edge);
  });

  it("handles unicode workspace slugs (just in case)", () => {
    const w: ConnectionLinkPayload = { ...sample, ws: "alice-公司" };
    const link = encodeConnectionLink(w);
    expect(decodeConnectionLink(link)).toEqual(w);
  });
});

describe("decode rejects bad input without throwing", () => {
  it("returns null for missing prefix", () => {
    expect(decodeConnectionLink("not-a-link")).toBeNull();
    expect(decodeConnectionLink("")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(decodeConnectionLink("hz_link_!!!!")).toBeNull();
  });

  it("returns null for valid base64 but non-JSON", () => {
    // base64url("not json") = "bm90IGpzb24"
    expect(decodeConnectionLink("hz_link_bm90IGpzb24")).toBeNull();
  });

  it("returns null when version is missing or wrong", () => {
    const link = encodeConnectionLink({ ...sample, v: 99 as unknown as 1 });
    expect(decodeConnectionLink(link)).toBeNull();
  });

  it("returns null when ed is unknown", () => {
    const broken = encodeConnectionLink({
      ...sample,
      ed: "self-host" as unknown as Edition,
    } as ConnectionLinkPayload);
    expect(decodeConnectionLink(broken)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    // Manually craft a payload missing `k`
    const json = JSON.stringify({ v: 1, ep: "x", ws: "y", ed: "cloud" });
    const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeConnectionLink(`hz_link_${b64}`)).toBeNull();
  });
});

describe("buildMcpSnippet", () => {
  it("emits a valid mcp.json with the expected url + bearer", () => {
    const snippet = buildMcpSnippet(sample);
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.huozi.type).toBe("http");
    expect(parsed.mcpServers.huozi.url).toBe("https://cloud.huozi.app/mcp");
    expect(parsed.mcpServers.huozi.headers.Authorization).toBe(
      "Bearer hz_a1b2c3d4e5f6",
    );
  });

  it("strips trailing slash from endpoint before joining /mcp", () => {
    const slashy = buildMcpSnippet({ ...sample, ep: "https://x.test/" });
    expect(JSON.parse(slashy).mcpServers.huozi.url).toBe("https://x.test/mcp");
  });
});

// Hint to the test runner that we use the type
import type { Edition } from "../connection-link";
void (null as unknown as Edition);
