export const PAYLOAD_CACHE_TAGS = {
  news: "payload:news-posts",
  homeNews: "payload:home-news-posts",
  reviews: "payload:reviews",
  homeReviews: "payload:home-reviews",
  learnPages: "payload:learn-pages",
} as const;

/** Per-gear tag for the gear page related-news cache. */
export function getGearRelatedNewsCacheTag(gearSlug: string): string {
  return `news-gear:${gearSlug}`;
}
