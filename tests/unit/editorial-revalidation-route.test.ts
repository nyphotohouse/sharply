import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cacheMocks);

import { POST } from "~/app/api/revalidate/editorial/route";
import { PAYLOAD_CACHE_TAGS } from "~/lib/payload-cache-tags";

function request(body: unknown, authorization = "Bearer test-secret") {
  return new Request("https://sharply.example/api/revalidate/editorial", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("editorial revalidation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYLOAD_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("expires collection data and localized public paths", async () => {
    const response = await POST(
      request({
        collection: "news",
        documents: [
          {
            slug: "camera-news",
            relatedGearSlugs: ["camera-one"],
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      PAYLOAD_CACHE_TAGS.news,
      { expire: 0 },
    );
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      PAYLOAD_CACHE_TAGS.homeNews,
      { expire: 0 },
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/ja/news/camera-news",
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/en/gear/camera-one",
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
  });

  it("expires only the related gear news tags, including removed relations", async () => {
    await POST(
      request({
        collection: "news",
        documents: [
          { slug: "camera-news", relatedGearSlugs: ["old-gear", "kept-gear"] },
          { slug: "camera-news", relatedGearSlugs: ["kept-gear", "new-gear"] },
        ],
      }),
    );

    const gearNewsTags = cacheMocks.revalidateTag.mock.calls
      .map(([tag]) => tag as string)
      .filter((tag) => tag.startsWith("news-gear:"));
    expect(gearNewsTags.sort()).toEqual([
      "news-gear:kept-gear",
      "news-gear:new-gear",
      "news-gear:old-gear",
    ]);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      "news-gear:old-gear",
      { expire: 0 },
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/gear/old-gear");
  });

  it("does not expire gear news tags for reviews", async () => {
    await POST(
      request({
        collection: "review",
        documents: [
          { slug: "camera-review", relatedGearSlugs: ["camera-one"] },
        ],
      }),
    );

    expect(cacheMocks.revalidateTag).not.toHaveBeenCalledWith(
      "news-gear:camera-one",
      expect.anything(),
    );
  });

  it("rejects requests without the Payload secret", async () => {
    const response = await POST(
      request(
        { collection: "news", documents: [{ slug: "camera-news" }] },
        "Bearer wrong",
      ),
    );

    expect(response.status).toBe(401);
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid collections and unsafe path segments", async () => {
    const invalidCollectionResponse = await POST(
      request({ collection: "users", documents: [{ slug: "camera-news" }] }),
    );
    expect(invalidCollectionResponse.status).toBe(400);

    await POST(
      request({
        collection: "learn-pages",
        documents: [{ slug: "../cms", relatedGearSlugs: ["/admin"] }],
      }),
    );

    expect(cacheMocks.revalidatePath).not.toHaveBeenCalledWith(
      expect.stringContaining("cms"),
      expect.anything(),
    );
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalledWith(
      expect.stringContaining("admin"),
      expect.anything(),
    );
  });
});
