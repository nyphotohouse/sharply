import type { LearnPage, News, Review } from "~/payload-types";
import { cache } from "react";
import {
  getNewsByRelatedGearSlugData,
  getHomeNewsPostsData,
  getHomeReviewsData,
  getNewsPostBySlugData,
  getNewsPostsData,
  getReviewByGearSlugData,
  getReviewBySlugData,
  getReviewsData,
} from "./data";

export const getNewsPosts = async (): Promise<News[]> => {
  return sortNewsPosts(await getNewsPostsData());
};

export const getHomeNewsPosts = async (): Promise<News[]> => {
  return sortNewsPosts(await getHomeNewsPostsData());
};

function sortNewsPosts(posts: News[]): News[] {
  const published = posts.filter((p) => p._status === "published");
  // sort by override date if it exists, otherwise sort by creation date
  const sorted = published.sort((a, b) => {
    const aTime = a.override_date
      ? new Date(a.override_date).getTime()
      : new Date(a.createdAt).getTime();
    const bTime = b.override_date
      ? new Date(b.override_date).getTime()
      : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
  return sorted;
}

export const getNewsPostBySlug = async (slug: string): Promise<News> => {
  const newsPost = await getNewsPostBySlugData(slug);
  if (newsPost._status !== "published") {
    throw new Error("News post is not published");
  }
  return newsPost;
};

export const getReviews = async (): Promise<Review[]> => {
  return sortReviews(await getReviewsData());
};

export const getHomeReviews = async (): Promise<Review[]> => {
  return sortReviews(await getHomeReviewsData());
};

function sortReviews(reviews: Review[]): Review[] {
  const published = reviews.filter((r) => r._status === "published");
  // sort by creation date only (no override for reviews)
  const sorted = published.sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
  return sorted;
}

export const getReviewBySlug = async (slug: string): Promise<Review | null> => {
  const review = await getReviewBySlugData(slug);
  if (review._status !== "published") {
    return null;
  }
  return review;
};

export const getReviewByGearSlug = cache(
  async (gearSlug: string): Promise<Review | null> => {
    const review = await getReviewByGearSlugData(gearSlug);
    if (!review) {
      return null;
    }
    if (review._status !== "published") {
      return null;
    }
    return review;
  },
);

export const getNewsByRelatedGearSlug = async (
  gearSlug: string,
  limit: number = 12,
): Promise<News[]> => {
  const list = await getNewsByRelatedGearSlugData(gearSlug, limit);
  return list.filter((p) => p._status === "published");
};

// Learn Pages
import { getLearnPageBySlugData, getLearnPagesData } from "./data";

export const getLearnPages = async (): Promise<LearnPage[]> => {
  const pages = await getLearnPagesData();
  const published = pages.filter((p) => p._status === "published");
  // Exclude explicitly unlisted pages from general listings (still routable by slug)
  const listed = published.filter((p) => !p.unlisted);
  // Sort newest first by createdAt
  const sorted = listed.sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
  return sorted;
};

// Include unlisted pages (still published) – useful for static params generation
export const getAllPublishedLearnPages = async (): Promise<LearnPage[]> => {
  const pages = await getLearnPagesData();
  const published = pages.filter((p) => p._status === "published");
  // Keep sort for deterministic params generation
  return published.sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
};

export const getLearnPageBySlug = async (
  slug: string,
): Promise<LearnPage | null> => {
  const page = await getLearnPageBySlugData(slug);
  if (!page) return null;
  if (page._status !== "published") return null;
  return page;
};
