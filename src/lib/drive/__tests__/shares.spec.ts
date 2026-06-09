import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudFetch } from "@/lib/cloud-fetch";
import { getShare, unlockShare } from "../shares";

vi.mock("@/lib/cloud-fetch", () => ({
  cloudFetch: vi.fn(),
}));

const mockedCloudFetch = vi.mocked(cloudFetch);

describe("share client errors", () => {
  beforeEach(() => {
    mockedCloudFetch.mockReset();
  });

  it("preserves share_expired error code and reader message", async () => {
    mockedCloudFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "share_expired",
          message: "该分享页面已经过期，请联系作者获得新链接",
        }),
        { status: 404 },
      ),
    );

    const res = await getShare("abc");

    expect(res).toEqual({
      ok: false,
      errorCode: 404,
      error: "share_expired",
      message: "该分享页面已经过期，请联系作者获得新链接",
    });
  });

  it("preserves expired payloads from unlock attempts", async () => {
    mockedCloudFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "share_expired",
          message: "该分享页面已经过期，请联系作者获得新链接",
        }),
        { status: 404 },
      ),
    );

    const res = await unlockShare("abc", "123456");

    expect(res).toEqual({
      ok: false,
      errorCode: 404,
      error: "share_expired",
      message: "该分享页面已经过期，请联系作者获得新链接",
    });
  });
});
