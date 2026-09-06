import "server-only";

import { revalidatePath } from "next/cache";
import { defaultLocale, locales } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";

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
 * Revalidate browse's shared layout for every locale. This covers the
 * catch-all page's root, brand, category, and mount-depth URLs.
 */
export function revalidateBrowsePages(): void {
  revalidateLocalizedPaths(["/browse"], "layout");
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
