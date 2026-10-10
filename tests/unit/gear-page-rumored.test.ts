import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??=
  "postgres://postgres:postgres@localhost:5432/sharply";
process.env.PAYLOAD_SECRET ??= "test-payload-secret";
process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3000";
process.env.OPENAI_API_KEY ??= "test-openai-key";

const gearServiceMocks = vi.hoisted(() => ({
  fetchGearAlternatives: vi.fn(),
  fetchGearAlternativesByGearId: vi.fn(),
  fetchGearBySlug: vi.fn(),
  fetchGearLineage: vi.fn().mockResolvedValue({
    predecessor: null,
    successor: null,
  }),
  fetchGearLineageByGearIdService: vi.fn().mockResolvedValue({
    predecessor: null,
    successor: null,
  }),
  fetchNewestGearSlugs: vi.fn(),
  fetchPendingEditCountForGear: vi.fn(),
  fetchStaffVerdict: vi.fn(),
  fetchStaffVerdictByGearId: vi.fn(),
  fetchUseCaseRatings: vi.fn(),
}));

const creatorVideoMocks = vi.hoisted(() => ({
  fetchPublicGearCreatorVideos: vi.fn(),
  fetchPublicGearCreatorVideosByGearId: vi.fn(),
}));

const payloadServiceMocks = vi.hoisted(() => ({
  getNewsByRelatedGearSlug: vi.fn(),
  getReviewByGearSlug: vi.fn(),
}));

const popularityServiceMocks = vi.hoisted(() => ({
  fetchHighTrafficGearSlugs: vi.fn(),
  fetchTrendingSlugs: vi.fn(),
  getTrendingStatusForSlugs: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const headersMocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

const authHelperMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

const intlServerMocks = vi.hoisted(() => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => "NOT_FOUND"),
}));

const priceMocks = vi.hoisted(() => ({
  getExchangeRates: vi.fn().mockResolvedValue(null),
}));
vi.mock("~/server/pricing/exchange-rates", () => priceMocks);

const dockMock = vi.hoisted(() => vi.fn(() => null));
const rumoredPageMock = vi.hoisted(() =>
  vi.fn(({ gearName }: { gearName: string }) => `<div>${gearName}</div>`),
);
const constructionPageMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("~/server/gear/service", () => gearServiceMocks);
vi.mock("~/server/creator-videos/service", () => creatorVideoMocks);
vi.mock("~/server/payload/service", () => payloadServiceMocks);
vi.mock("~/server/popularity/service", () => popularityServiceMocks);
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/reviews/summary/service", () => ({
  maybeGenerateReviewSummary: vi.fn(),
}));
vi.mock("~/server/reviews/moderation/service", () => ({
  testReviewSafety: vi.fn(),
}));
vi.mock("~/lib/open-ai/open-ai", () => ({
  openai: {},
}));
vi.mock("server-only", () => ({}));
vi.mock("~/auth", () => authMocks);
vi.mock("next/headers", () => headersMocks);
vi.mock("~/lib/auth/auth-helpers", () => authHelperMocks);
vi.mock("next-intl/server", () => intlServerMocks);
vi.mock("next/navigation", () => navigationMocks);
vi.mock("~/components/gear/gear-tools-dock/gear-item-dock", () => ({
  GearItemDock: dockMock,
}));
vi.mock("~/app/[locale]/(pages)/gear/_components/rumored-full", () => ({
  RumoredFullPage: rumoredPageMock,
}));
vi.mock("~/app/[locale]/(pages)/gear/_components/construction-full", () => ({
  ConstructionFullPage: constructionPageMock,
}));
vi.mock("~/server/admin/gear/actions", () => ({}));

import Page from "~/app/[locale]/(pages)/gear/[slug]/page";

describe("gear page rumored state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMocks.headers.mockResolvedValue(new Headers());
    authMocks.auth.api.getSession.mockResolvedValue({
      user: { id: "editor-1" },
    });
    authHelperMocks.requireRole.mockReturnValue(true);
  });

  it("renders the rumored placeholder and skips the under-construction page", async () => {
    gearServiceMocks.fetchGearBySlug.mockResolvedValue({
      id: "gear-1",
      slug: "nikon-z9ii",
      name: "Nikon Z9II",
      gearType: "CAMERA",
      brandId: "nikon",
      publicationState: "RUMORED",
      regionalAliases: [],
      thumbnailUrl: null,
      topViewUrl: null,
      rearViewUrl: null,
      linkInstructionManual: null,
      rawSamples: [],
    });

    renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ locale: "en", slug: "nikon-z9ii" }),
      }),
    );

    expect(gearServiceMocks.fetchGearBySlug).toHaveBeenCalledWith(
      "nikon-z9ii",
      { includeRumored: true },
    );
    expect(rumoredPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "nikon-z9ii",
      }),
      undefined,
    );
    expect(constructionPageMock).not.toHaveBeenCalled();
    expect(priceMocks.getExchangeRates).not.toHaveBeenCalled();
    expect(dockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationState: "RUMORED",
      }),
      undefined,
    );
  });

  it("treats hidden items as unavailable on the public route", async () => {
    gearServiceMocks.fetchGearBySlug.mockRejectedValue(
      Object.assign(new Error("Gear not found"), { status: 404 }),
    );

    const result = await Page({
      params: Promise.resolve({ locale: "en", slug: "nikon-z9ii" }),
    });

    expect(result).toBe("NOT_FOUND");
    expect(navigationMocks.notFound).toHaveBeenCalledTimes(1);
    expect(priceMocks.getExchangeRates).not.toHaveBeenCalled();
  });
});
