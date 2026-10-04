import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import "server-only";
import type { LearnPage, News, Review } from "~/payload-types";
import config from "~/payload.config";

const PAYLOAD_CONTENT_REVALIDATE_SECONDS = 60;
const HOME_CONTENT_REVALIDATE_SECONDS = 15 * 60;

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
  ["payload:news-posts"],
  { revalidate: PAYLOAD_CONTENT_REVALIDATE_SECONDS },
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
  ["payload:reviews"],
  { revalidate: PAYLOAD_CONTENT_REVALIDATE_SECONDS },
);

// Home has separate cache keys so its longer freshness window does not affect
// the shared news and review caches used by other routes.
const getHomeNewsPostsDataCached = unstable_cache(
  async (): Promise<News[]> => {
    const payload = await getPayloadClient();
    const newsPosts = await payload.find({
      collection: "news",
      limit: -1,
    });
    return newsPosts.docs;
  },
  ["payload:home-news-posts"],
  { revalidate: HOME_CONTENT_REVALIDATE_SECONDS },
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
  ["payload:home-reviews"],
  { revalidate: HOME_CONTENT_REVALIDATE_SECONDS },
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
  ["payload:learn-pages"],
  { revalidate: PAYLOAD_CONTENT_REVALIDATE_SECONDS },
);

export const getNewsPostsData = async (): Promise<News[]> => {
  return getNewsPostsDataCached();
};

export const getNewsPostBySlugData = async (slug: string): Promise<News> => {
  const payload = await getPayloadClient();
  const newsPost = await payload.find({
    collection: "news",
    where: { slug: { equals: slug } },
  });
  return newsPost.docs[0]!;
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

export const getReviewBySlugData = async (slug: string): Promise<Review> => {
  const payload = await getPayloadClient();
  const review = await payload.find({
    collection: "review",
    where: { slug: { equals: slug } },
  });
  return review.docs[0]!;
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
  // Fetch all and filter locally (JSON field cannot be filtered with ILIKE)
  const all = await getNewsPostsData();
  const filtered = all.filter((n) => {
    const v = n.related_gear_items;
    if (!Array.isArray(v)) return false;
    return v.some((x) => typeof x === "string" && x === gearSlug);
  });
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
