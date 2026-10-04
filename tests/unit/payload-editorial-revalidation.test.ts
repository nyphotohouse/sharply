import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  createEditorialAfterChangeHook,
  createEditorialAfterDeleteHook,
} from "~/collections/editorial-revalidation";

function hookArgs({
  doc,
  previousDoc,
  search = "",
  data,
}: {
  doc: Record<string, unknown>;
  previousDoc?: Record<string, unknown>;
  search?: string;
  data?: Record<string, unknown>;
}) {
  return {
    doc,
    previousDoc,
    req: {
      origin: "https://sharply.example",
      searchParams: new URLSearchParams(search),
      data,
    },
  };
}

describe("Payload editorial revalidation hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYLOAD_SECRET", "test-secret");
    vi.stubEnv("VERCEL_URL", "sharply.example");
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requests revalidation for published News and linked gear pages", async () => {
    const doc = {
      _status: "published",
      slug: "new-camera-news",
      related_gear_items: ["camera-one", "camera-two"],
    };

    await createEditorialAfterChangeHook("news")(hookArgs({ doc }) as never);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://sharply.example/api/revalidate/editorial"),
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer test-secret",
          "content-type": "application/json",
        },
        cache: "no-store",
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      collection: "news",
      documents: [
        {
          slug: "new-camera-news",
          relatedGearSlugs: ["camera-one", "camera-two"],
        },
      ],
    });
  });

  it("sends old and new review slugs and gear links when unpublishing", async () => {
    await createEditorialAfterChangeHook("review")(
      hookArgs({
        doc: {
          _status: "draft",
          slug: "new-review-slug",
          review_gear_item: "new-gear",
        },
        previousDoc: {
          _status: "published",
          slug: "old-review-slug",
          review_gear_item: "old-gear",
        },
      }) as never,
    );

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      collection: "review",
      documents: [
        { slug: "old-review-slug", relatedGearSlugs: ["old-gear"] },
        { slug: "new-review-slug", relatedGearSlugs: ["new-gear"] },
      ],
    });
  });

  it("skips draft saves and autosaves", async () => {
    const hook = createEditorialAfterChangeHook("news");

    await hook(
      hookArgs({
        doc: { _status: "published", slug: "article" },
        previousDoc: { _status: "published", slug: "article" },
        search: "draft=true",
      }) as never,
    );
    await hook(
      hookArgs({
        doc: { _status: "published", slug: "article" },
        previousDoc: { _status: "published", slug: "article" },
        search: "autosave=true",
      }) as never,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the app for local API operations", async () => {
    await createEditorialAfterChangeHook("learn-pages")({
      doc: { _status: "published", slug: "camera-basics" },
      req: { searchParams: new URLSearchParams() },
    } as never);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests invalidation after deleting a published document", async () => {
    await createEditorialAfterDeleteHook("review")({
      doc: { _status: "published", slug: "review-slug" },
      req: { origin: "https://sharply.example" },
    } as never);

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      collection: "review",
      documents: [{ slug: "review-slug", relatedGearSlugs: [] }],
    });
  });
});
