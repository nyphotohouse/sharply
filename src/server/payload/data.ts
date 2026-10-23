import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import "server-only";
import type { LearnPage, News, Review } from "~/payload-types";
import config from "~/payload.config";
import {
  getGearRelatedNewsCacheTag,
  PAYLOAD_CACHE_TAGS,
} from "~/lib/payload-cache-tags";

// Matches the gear page's 24h revalidate. Gear pages server-render related news,
// and Next lowers a page's effective revalidate to the shortest cache it reads,
// so an hourly value here made gear pages regenerate hourly. Publishing still
// refreshes this content through the editorial revalidation tags, so this
// interval is only a fallback for changes that skip those hooks.
const PAYLOAD_CONTENT_REVALIDATE_SECONDS = 60 * 60 * 24;
// Home revalidates daily and publishing invalidates these entries by tag, so an
// hourly fallback only made Home regenerate more often without fresher content.
const HOME_CONTENT_REVALIDATE_SECONDS = 60 * 60 * 24;
// Gear pages revalidate every 3 days, so their related-news lookup gets its own
// 3-day cache instead of lowering them to the 24h /news and /learn interval.
// It is tagged per gear slug, so publishing refreshes only the related gear pages.
const GEAR_RELATED_NEWS_REVALIDATE_SECONDS = 60 * 60 * 24 * 3;

let payloadPromise: ReturnType<typeof getPayload> | undefined;

async function getPayloadClient() {
  if (!payloadPromise) {
    payloadPromise = getPayload({ config });
  }

  try {
    return await payloadPromise;
  } catch (error) {
    payloadPromise = undefined;
    throw error;
  }
}

const getNewsPostsDataCached = unstable_cache(
  async (): Promise<News[]> => {
    const payload = await getPayloadClient();
    const newsPosts = await payload.find({
      collection: "news",
      limit: -1,
    });
    return newsPosts.docs;
  },
  [PAYLOAD_CACHE_TAGS.news],
  {
    revalidate: PAYLOAD_CONTENT_REVALIDATE_SECONDS,
    tags: [PAYLOAD_CACHE_TAGS.news],
  },
);

const getReviewsDataCached = unstable_cache(
  async (): Promise<Review[]> => {
    const payload = await getPayloadClient();
    const reviews = await payload.find({
      collection: "review",
      limit: -1,
    });
    return reviews.docs;
  },
  [PAYLOAD_CACHE_TAGS.reviews],
  {
    revalidate: PAYLOAD_CONTENT_REVALIDATE_SECONDS,
    tags: [PAYLOAD_CACHE_TAGS.reviews],
  },
);

// One cache entry per gear slug, tagged only with that slug's news tag.
const getGearRelatedNewsPostsDataCached = (gearSlug: string) =>
  unstable_cache(
    async (): Promise<News[]> => {
      const payload = await getPayloadClient();
      const newsPosts = await payload.find({
        collection: "news",
        limit: -1,
      });
      // Filter locally (JSON field cannot be filtered with ILIKE)
      return newsPosts.docs.filter((n) => {
        const v = n.related_gear_items;
        if (!Array.isArray(v)) return false;
        return v.some((x) => typeof x === "string" && x === gearSlug);
      });
    },
    ["payload:gear-related-news-posts", gearSlug],
    {
      revalidate: GEAR_RELATED_NEWS_REVALIDATE_SECONDS,
      tags: [getGearRelatedNewsCacheTag(gearSlug)],
    },
  )();

// Home keeps separate cache entries so publish hooks can invalidate its
// snapshot alongside the Home page.
const getHomeNewsPostsDataCached = unstable_cache(
  async (): Promise<News[]> => {
    const payload = await getPayloadClient();
    const newsPosts = await payload.find({
      collection: "news",
      limit: -1,
    });
    return newsPosts.docs;
  },
  [PAYLOAD_CACHE_TAGS.homeNews],
  {
    revalidate: HOME_CONTENT_REVALIDATE_SECONDS,
    tags: [PAYLOAD_CACHE_TAGS.homeNews],
  },
);

const getHomeReviewsDataCached = unstable_cache(
  async (): Promise<Review[]> => {
    const payload = await getPayloadClient();
    const reviews = await payload.find({
      collection: "review",
      limit: -1,
    });
    return reviews.docs;
  },
  [PAYLOAD_CACHE_TAGS.homeReviews],
  {
    revalidate: HOME_CONTENT_REVALIDATE_SECONDS,
    tags: [PAYLOAD_CACHE_TAGS.homeReviews],
  },
);

const getLearnPagesDataCached = unstable_cache(
  async (): Promise<LearnPage[]> => {
    const payload = await getPayloadClient();
    const learnPages = await payload.find({
      collection: "learn-pages",
      limit: -1,
      depth: 1,
    });
    return learnPages.docs;
  },
  [PAYLOAD_CACHE_TAGS.learnPages],
  {
    revalidate: PAYLOAD_CONTENT_REVALIDATE_SECONDS,
    tags: [PAYLOAD_CACHE_TAGS.learnPages],
  },
);

export const getNewsPostsData = async (): Promise<News[]> => {
  return getNewsPostsDataCached();
};

export const getNewsPostBySlugData = async (
  slug: string,
): Promise<News | null> => {
  const payload = await getPayloadClient();
  const newsPost = await payload.find({
    collection: "news",
    where: { slug: { equals: slug } },
  });
  return newsPost.docs[0] ?? null;
};

export const getReviewsData = async (): Promise<Review[]> => {
  return getReviewsDataCached();
};

export const getHomeNewsPostsData = async (): Promise<News[]> => {
  return getHomeNewsPostsDataCached();
};

export const getHomeReviewsData = async (): Promise<Review[]> => {
  return getHomeReviewsDataCached();
};

export const getReviewBySlugData = async (
  slug: string,
): Promise<Review | null> => {
  const payload = await getPayloadClient();
  const review = await payload.find({
    collection: "review",
    where: { slug: { equals: slug } },
  });
  return review.docs[0] ?? null;
};

export const getReviewByGearSlugData = async (
  gearSlug: string,
): Promise<Review> => {
  const payload = await getPayloadClient();
  const review = await payload.find({
    collection: "review",
    where: { review_gear_item: { equals: gearSlug } },
  });
  return review.docs[0]!;
};

export const getNewsByRelatedGearSlugData = async (
  gearSlug: string,
  limit: number = 12,
): Promise<News[]> => {
  const filtered = await getGearRelatedNewsPostsDataCached(gearSlug);
  return filtered.slice(0, limit < 0 ? filtered.length : limit);
};

export const getLearnPagesData = async (): Promise<LearnPage[]> => {
  return getLearnPagesDataCached();
};

export const getLearnPageBySlugData = async (
  slug: string,
): Promise<LearnPage | null> => {
  const payload = await getPayloadClient();
  const res = (await payload.find({
    collection: "learn-pages",
    where: { slug: { equals: slug } },
    limit: 1,
    // Expand the Read Next page and that page's thumbnail upload.
    depth: 2,
  })) as unknown as { docs: LearnPage[] };
  return res.docs[0] ?? null;
};
