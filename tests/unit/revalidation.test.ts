import { existsSync } from "node:fs";
import { join } from "node:path";
import { getImplicitTags } from "next/dist/server/lib/implicit-tags";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { locales } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cacheMocks);

import {
  BROWSE_PAGE_ROUTE_PATTERN,
  revalidateBrowsePages,
  revalidateGearPages,
  revalidateLocalizedPaths,
} from "~/server/revalidation";

describe("shared public revalidation helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates localized dynamic page paths", () => {
    revalidateLocalizedPaths(["/gear/[slug]"], "page");

    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(locales.length + 1);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/gear/[slug]",
      "page",
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/en/gear/[slug]",
      "page",
    );
    for (const locale of locales) {
      if (locale === "en") continue;
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
        localizePathname("/gear/[slug]", locale),
        "page",
      );
    }
  });

  it("deduplicates slugs and ignores blank values", () => {
    revalidateGearPages(["nikon-zf", " nikon-zf ", ""]);

    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(locales.length + 1);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/gear/nikon-zf");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/en/gear/nikon-zf");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/ja/gear/nikon-zf");
  });

  it("revalidates the browse route pattern once for every locale", () => {
    revalidateBrowsePages();

    // Next derives page tags from the route pattern, so one call covers the
    // root, brand, category, and mount URLs in every locale.
    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/[locale]/(pages)/browse/[[...segments]]",
      "page",
    );
  });

  it("revalidates gear pages and browse when requested", () => {
    revalidateGearPages(["canon-r5", "canon-r5-ii"], {
      includeBrowse: true,
    });

    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(
      (locales.length + 1) * 2 + 1,
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/gear/canon-r5");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/ja/gear/canon-r5-ii",
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/[locale]/(pages)/browse/[[...segments]]",
      "page",
    );
  });

  it("targets a tag that Next attaches to rendered browse pages", async () => {
    // The pattern must point at the real catch-all page file.
    expect(
      existsSync(
        join(process.cwd(), "src/app", BROWSE_PAGE_ROUTE_PATTERN, "page.tsx"),
      ),
    ).toBe(true);

    // revalidatePath(pattern, "page") invalidates `_N_T_<pattern>/page`.
    // Check it against the implicit tags Next derives for a concrete render.
    const { tags } = await getImplicitTags(
      `${BROWSE_PAGE_ROUTE_PATTERN}/page`,
      "/en/browse/canon",
      null,
    );
    expect(tags).toContain(`_N_T_${BROWSE_PAGE_ROUTE_PATTERN}/page`);
    // The previous per-locale layout paths never matched any page tag.
    expect(tags).not.toContain("_N_T_/en/browse/layout");
  });
});
