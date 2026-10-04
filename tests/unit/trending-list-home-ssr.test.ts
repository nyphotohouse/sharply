import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const popularityMocks = vi.hoisted(() => ({
  fetchStableTrending: vi.fn(),
  fetchTrending: vi.fn(),
}));

const translationMocks = vi.hoisted(() => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

const swrMocks = vi.hoisted(() => ({
  useSWR: vi.fn(() => ({ data: undefined, error: undefined })),
}));

const linkStatusMocks = vi.hoisted(() => ({
  useLinkStatus: vi.fn(() => ({ pending: false })),
}));

vi.mock("~/server/popularity/service", () => popularityMocks);
vi.mock("next-intl/server", () => translationMocks);
vi.mock("swr", () => ({ default: swrMocks.useSWR }));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: ComponentProps<"a"> & { children?: ReactNode }) =>
    createElement("a", props, children),
  useLinkStatus: linkStatusMocks.useLinkStatus,
}));
vi.mock("~/components/gear/gear-display-name", () => ({
  GearDisplayName: ({ name }: { name: string }) => name,
}));

import TrendingList from "~/components/trending-list";

describe("Home trending server render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swrMocks.useSWR.mockReturnValue({ data: undefined, error: undefined });
    popularityMocks.fetchStableTrending.mockResolvedValue([
      {
        gearId: "gear-1",
        slug: "nikon-zf",
        name: "Nikon Zf",
        regionalAliases: null,
        brandName: "Nikon",
        gearType: "CAMERA",
        thumbnailUrl: null,
        releaseDate: null,
        releaseDatePrecision: null,
        announcedDate: null,
        announceDatePrecision: null,
        msrpNowUsdCents: null,
        mpbMaxPriceUsdCents: null,
        lifetimeViews: 30,
        score: 12,
        stats: {
          views: 20,
          wishlistAdds: 1,
          ownerAdds: 0,
          compareAdds: 0,
          reviewSubmits: 0,
        },
        asOfDate: "2026-10-02",
      },
    ]);
  });

  it("renders the stable ranking before hydration and passes compact fallback data", async () => {
    const component = await TrendingList({
      locale: "en",
      timeframe: "7d",
      limit: 10,
      liveRefresh: true,
    });
    const markup = renderToStaticMarkup(component);

    expect(markup).toContain("Nikon Zf");
    expect(popularityMocks.fetchStableTrending).toHaveBeenCalledWith({
      timeframe: "7d",
      limit: 10,
      filters: undefined,
    });
    expect(popularityMocks.fetchTrending).not.toHaveBeenCalled();
    expect(swrMocks.useSWR).toHaveBeenCalledWith(
      "/api/trending/home",
      expect.any(Function),
      expect.objectContaining({
        fallbackData: {
          items: [
            {
              gearId: "gear-1",
              slug: "nikon-zf",
              name: "Nikon Zf",
              regionalAliases: null,
              filled: 3,
            },
          ],
        },
      }),
    );
  });
});
