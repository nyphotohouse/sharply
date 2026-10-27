import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  unstable_cache: vi.fn(
    <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => fn,
  ),
}));

const payloadMocks = vi.hoisted(() => ({
  getPayload: vi.fn(),
}));

vi.mock("next/cache", () => cacheMocks);
vi.mock("payload", () => payloadMocks);
vi.mock("server-only", () => ({}));
vi.mock("~/payload.config", () => ({
  default: {},
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("payload data client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("retries payload initialization after a rejected client promise", async () => {
    const initError = new Error("payload init failed");
    const payloadClient = {
      find: vi.fn().mockResolvedValue({
        docs: [{ slug: "retry-succeeded" }],
      }),
    };

    payloadMocks.getPayload
      .mockRejectedValueOnce(initError)
      .mockResolvedValueOnce(payloadClient);

    const { getNewsPostsData } = await import("~/server/payload/data");

    await expect(getNewsPostsData()).rejects.toThrow(initError);
    await expect(getNewsPostsData()).resolves.toEqual([
      { slug: "retry-succeeded" },
    ]);

    expect(payloadMocks.getPayload).toHaveBeenCalledTimes(2);
    expect(payloadClient.find).toHaveBeenCalledTimes(1);
    expect(payloadClient.find).toHaveBeenCalledWith({
      collection: "news",
      limit: -1,
    });
  });

  it("shares a single in-flight payload client promise across concurrent callers", async () => {
    const deferredClient = createDeferred<{
      find: ReturnType<typeof vi.fn>;
    }>();
    const payloadClient = {
      find: vi.fn(({ collection }: { collection: string }) =>
        Promise.resolve({ docs: [{ collection }] }),
      ),
    };

    payloadMocks.getPayload.mockReturnValueOnce(deferredClient.promise);

    const { getNewsPostsData, getReviewsData } =
      await import("~/server/payload/data");

    const newsPromise = getNewsPostsData();
    const reviewsPromise = getReviewsData();

    expect(payloadMocks.getPayload).toHaveBeenCalledTimes(1);

    deferredClient.resolve(payloadClient);

    await expect(newsPromise).resolves.toEqual([{ collection: "news" }]);
    await expect(reviewsPromise).resolves.toEqual([{ collection: "review" }]);
    expect(payloadMocks.getPayload).toHaveBeenCalledTimes(1);
  });

  it("expands a Learn page's Read Next thumbnail", async () => {
    const payloadClient = {
      find: vi.fn().mockResolvedValue({ docs: [] }),
    };
    payloadMocks.getPayload.mockResolvedValue(payloadClient);

    const { getLearnPageBySlugData } = await import("~/server/payload/data");

    await getLearnPageBySlugData("camera-basics");

    expect(payloadClient.find).toHaveBeenCalledWith({
      collection: "learn-pages",
      where: { slug: { equals: "camera-basics" } },
      limit: 1,
      depth: 2,
    });
  });

  it("caches gear-related news for 3 days under a per-gear tag", async () => {
    const payloadClient = {
      find: vi.fn().mockResolvedValue({
        docs: [
          { slug: "related", related_gear_items: ["camera-one"] },
          { slug: "unrelated", related_gear_items: ["camera-two"] },
          { slug: "no-gear" },
        ],
      }),
    };
    payloadMocks.getPayload.mockResolvedValue(payloadClient);

    const { getNewsByRelatedGearSlugData } =
      await import("~/server/payload/data");

    await expect(getNewsByRelatedGearSlugData("camera-one")).resolves.toEqual([
      { slug: "related", related_gear_items: ["camera-one"] },
    ]);
    expect(cacheMocks.unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["payload:gear-related-news-posts", "camera-one"],
      { revalidate: 60 * 60 * 24 * 3, tags: ["news-gear:camera-one"] },
    );
  });

  it("caches Home news and reviews for a day under Home tags", async () => {
    await import("~/server/payload/data");

    // Home revalidates daily, so shorter Home caches would cap the page.
    expect(cacheMocks.unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["payload:home-news-posts"],
      { revalidate: 60 * 60 * 24, tags: ["payload:home-news-posts"] },
    );
    expect(cacheMocks.unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["payload:home-reviews"],
      { revalidate: 60 * 60 * 24, tags: ["payload:home-reviews"] },
    );
  });

  it("returns null when a News slug is no longer available", async () => {
    const payloadClient = {
      find: vi.fn().mockResolvedValue({ docs: [] }),
    };
    payloadMocks.getPayload.mockResolvedValue(payloadClient);

    const { getNewsPostBySlugData } = await import("~/server/payload/data");

    await expect(getNewsPostBySlugData("old-slug")).resolves.toBeNull();
  });
});
