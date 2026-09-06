import { beforeEach, describe, expect, it, vi } from "vitest";
import { locales } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cacheMocks);

import {
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

  it("revalidates the browse layout for every locale", () => {
    revalidateBrowsePages();

    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(locales.length + 1);
    for (const locale of locales) {
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
        localizePathname("/browse", locale),
        "layout",
      );
    }
  });

  it("revalidates gear pages and browse when requested", () => {
    revalidateGearPages(["canon-r5", "canon-r5-ii"], {
      includeBrowse: true,
    });

    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(
      (locales.length + 1) * 3,
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/gear/canon-r5");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/ja/gear/canon-r5-ii",
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/de/browse",
      "layout",
    );
  });
});
