import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { defaultLocale, locales } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";
import { PAYLOAD_CACHE_TAGS } from "~/lib/payload-cache-tags";

export type RevalidationPathType = "page" | "layout";

/**
 * Revalidate the same normalized paths for every supported public locale.
 *
 * Actions generally do not receive the active locale, while the public app
 * serves both the unprefixed default locale and prefixed alternate locales.
 */
export function revalidateLocalizedPaths(
  pathnames: Iterable<string>,
  type?: RevalidationPathType,
): void {
  const uniquePathnames = new Set(
    Array.from(pathnames).filter((pathname) => pathname.length > 0),
  );

  for (const locale of locales) {
    for (const pathname of uniquePathnames) {
      const localizedPathname = localizePathname(pathname, locale);
      const paths =
        locale === defaultLocale
          ? [
              localizedPathname,
              localizedPathname === "/"
                ? `/${defaultLocale}`
                : `/${defaultLocale}${localizedPathname}`,
            ]
          : [localizedPathname];

      for (const path of paths) {
        if (type) {
          revalidatePath(path, type);
        } else {
          revalidatePath(path);
        }
      }
    }
  }
}

/**
 * Route pattern of the browse catch-all page (root, brand, category, and
 * mount-depth URLs for every locale).
 */
export const BROWSE_PAGE_ROUTE_PATTERN =
  "/[locale]/(pages)/browse/[[...segments]]";

/**
 * Revalidate every browse page in every locale.
 *
 * Next tags each rendered page with derived tags built from its route
 * pattern (for example `/[locale]/(pages)/browse/[[...segments]]/page`) plus
 * its concrete pathname, not with layout tags for concrete URLs. A concrete
 * `revalidatePath("/en/browse", "layout")` therefore matched nothing, so we
 * revalidate the route pattern once instead; it covers all locales.
 */
export function revalidateBrowsePages(): void {
  revalidatePath(BROWSE_PAGE_ROUTE_PATTERN, "page");
}

/**
 * Revalidate public gear detail pages, optionally including all browse pages
 * when the mutation changes browse-visible data.
 */
export function revalidateGearPages(
  slugs: Iterable<string>,
  options: { includeBrowse?: boolean } = {},
): void {
  const uniqueSlugs = new Set(
    Array.from(slugs)
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0),
  );

  revalidateLocalizedPaths(Array.from(uniqueSlugs, (slug) => `/gear/${slug}`));

  if (options.includeBrowse) {
    revalidateBrowsePages();
  }
}

export type EditorialCollection = "news" | "review" | "learn-pages";

/**
 * Invalidate Payload-backed editorial data and every public surface that
 * renders it. Called from the authenticated editorial revalidation route.
 */
export function revalidateEditorialContent(
  collection: EditorialCollection,
  documents: Array<{
    slug?: string | null;
    relatedGearSlugs?: string[];
  }>,
): void {
  const tagGroups = {
    news: [PAYLOAD_CACHE_TAGS.news, PAYLOAD_CACHE_TAGS.homeNews],
    review: [PAYLOAD_CACHE_TAGS.reviews, PAYLOAD_CACHE_TAGS.homeReviews],
    "learn-pages": [PAYLOAD_CACHE_TAGS.learnPages],
  } satisfies Record<EditorialCollection, string[]>;

  for (const tag of tagGroups[collection]) {
    revalidateTag(tag, { expire: 0 });
  }

  const slugs = Array.from(
    new Set(
      documents
        .map((document) => document.slug?.trim())
        .filter((slug): slug is string => Boolean(slug)),
    ),
  );
  const gearSlugs = Array.from(
    new Set(
      documents.flatMap((document) =>
        (document.relatedGearSlugs ?? [])
          .map((slug) => slug.trim())
          .filter(Boolean),
      ),
    ),
  );

  const paths: string[] = ["/sitemap.xml"];
  if (collection === "news") {
    paths.push("/news", "/");
    paths.push(...slugs.map((slug) => `/news/${slug}`));
    paths.push(...gearSlugs.map((slug) => `/gear/${slug}`));
  } else if (collection === "review") {
    paths.push("/reviews", "/");
    paths.push(...slugs.map((slug) => `/reviews/${slug}`));
    paths.push(...gearSlugs.map((slug) => `/gear/${slug}`));
  } else {
    paths.push("/learn");
    paths.push(...slugs.map((slug) => `/learn/${slug}`));
  }

  if (collection === "learn-pages") {
    // Learn articles share a layout that renders the whole Learn navigation
    // and Read Next relationships, so invalidating it refreshes all children.
    revalidateLocalizedPaths(["/learn"], "layout");
  } else {
    revalidateLocalizedPaths(paths.filter((path) => path !== "/sitemap.xml"));
  }
  revalidatePath("/sitemap.xml");
}
