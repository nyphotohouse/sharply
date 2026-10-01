import { describe, expect, it } from "vitest";
import { BRANDS } from "~/lib/generated";
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildEditorialReviewJsonLd,
  buildGearProductJsonLd,
  buildJsonLdGraph,
  buildWebSiteJsonLd,
  getGearKeySpecs,
} from "~/lib/seo/json-ld-helpers";
import type { GearItem } from "~/types/gear";

const BASE = "https://www.sharplyphoto.com";
const brand = BRANDS[0]!;

function makeGearItem(overrides: Record<string, unknown> = {}): GearItem {
  return {
    slug: "test-camera",
    name: "Test Camera",
    brandId: brand.id,
    gearType: "CAMERA",
    weightGrams: null,
    msrpNowUsdCents: null,
    mpbMaxPriceUsdCents: null,
    linkMpb: null,
    ...overrides,
  } as unknown as GearItem;
}

/** Fails with a named assertion (not a null deref) when no Product is built. */
function expectProduct(
  product: ReturnType<typeof buildGearProductJsonLd>,
): NonNullable<typeof product> {
  expect(product).not.toBeNull();
  return product!;
}

describe("buildGearProductJsonLd", () => {
  it("builds a Product with brand, category, and canonical ids", () => {
    const product = expectProduct(
      buildGearProductJsonLd({
        item: makeGearItem({ msrpNowUsdCents: 199900 }),
        displayName: "Test Camera",
      }),
    );

    expect(product["@type"]).toBe("Product");
    expect(product.additionalType).toBe("https://schema.org/ProductModel");
    expect(product["@id"]).toBe(`${BASE}/gear/test-camera`);
    expect(product.url).toBe(`${BASE}/gear/test-camera`);
    expect(product.category).toBe("Camera");
    expect(product.brand).toMatchObject({
      "@type": "Brand",
      name: brand.name,
      url: `${BASE}/browse/${brand.slug}`,
    });
  });

  it("emits a used-condition offer mirroring the displayed MPB price", () => {
    const product = expectProduct(
      buildGearProductJsonLd({
        item: makeGearItem({
          mpbMaxPriceUsdCents: 123456,
          msrpNowUsdCents: 200000,
          linkMpb: "https://www.mpb.com/product/test",
        }),
        displayName: "Test Camera",
      }),
    );

    expect(product.offers).toMatchObject({
      "@type": "Offer",
      price: "1234.56",
      priceCurrency: "USD",
      itemCondition: "https://schema.org/UsedCondition",
      url: "https://www.mpb.com/product/test",
    });
  });

  it("falls back to a new-condition MSRP offer without MPB data", () => {
    const product = expectProduct(
      buildGearProductJsonLd({
        item: makeGearItem({ msrpNowUsdCents: 199900 }),
        displayName: "Test Camera",
      }),
    );

    expect(product.offers).toMatchObject({
      price: "1999.00",
      itemCondition: "https://schema.org/NewCondition",
    });
  });

  it("does not emit a purchasable Offer for a derived used estimate", () => {
    expect(
      buildGearProductJsonLd({
        item: makeGearItem({
          usedPriceProjection: {
            US: {
              low: 150000,
              typical: 175000,
              high: 200000,
              asOf: "2026-09-29T15:00:00.000Z",
              status: "stale",
              sourceCount: 1,
              observationCount: 3,
              methodVersion: 1,
            },
          },
          mpbMaxPriceUsdCents: 120000,
          msrpNowUsdCents: 200000,
        }),
        displayName: "Test Camera",
      }),
    ).toBeNull();
  });

  it("emits no Product at all without positive price data", () => {
    // Google requires offers, review, or aggregateRating for Product
    // snippets; a Product with none is a Search Console critical issue.
    expect(
      buildGearProductJsonLd({
        item: makeGearItem(),
        displayName: "Test Camera",
      }),
    ).toBeNull();
    expect(
      buildGearProductJsonLd({
        item: makeGearItem({ mpbMaxPriceUsdCents: 0 }),
        displayName: "Test Camera",
      }),
    ).toBeNull();
  });

  it("absolutizes relative image urls and omits missing descriptions", () => {
    const product = expectProduct(
      buildGearProductJsonLd({
        item: makeGearItem({ msrpNowUsdCents: 199900 }),
        displayName: "Test Camera",
        imageUrl: "/images/test.jpg",
      }),
    );

    expect(product.image).toBe(`${BASE}/images/test.jpg`);
    expect(product.description).toBeUndefined();
  });
});

describe("getGearKeySpecs", () => {
  it("formats camera specs without trailing decimal zeros", () => {
    const specs = getGearKeySpecs(
      makeGearItem({
        cameraSpecs: {
          resolutionMp: "45.70",
          sensorFormatId: null,
          hasIbis: true,
        },
        weightGrams: 910,
      }),
    );

    expect(specs).toContainEqual({
      name: "Sensor Resolution",
      value: "45.7 MP",
    });
    expect(specs).toContainEqual({
      name: "In-Body Stabilization",
      value: "Yes",
    });
    expect(specs).toContainEqual({ name: "Weight", value: "910 g" });
  });

  it("formats zoom and prime lens focal lengths", () => {
    const zoom = getGearKeySpecs(
      makeGearItem({
        gearType: "LENS",
        lensSpecs: {
          focalLengthMinMm: "24.00",
          focalLengthMaxMm: "70.00",
          maxApertureWide: "2.80",
        },
      }),
    );
    expect(zoom).toContainEqual({ name: "Focal Length", value: "24-70 mm" });
    expect(zoom).toContainEqual({ name: "Maximum Aperture", value: "f/2.8" });

    const prime = getGearKeySpecs(
      makeGearItem({
        gearType: "LENS",
        lensSpecs: {
          focalLengthMinMm: "50.00",
          focalLengthMaxMm: "50.00",
          maxApertureWide: null,
        },
      }),
    );
    expect(prime).toContainEqual({ name: "Focal Length", value: "50 mm" });
  });
});

describe("buildEditorialReviewJsonLd", () => {
  it("nests pros/cons item lists inside a Product review", () => {
    const node = buildEditorialReviewJsonLd({
      path: "/reviews/test-camera-review",
      headline: "Test Camera Review",
      productName: "Test Camera",
      gearSlug: "test-camera",
      pros: ["Great sensor", "Fast AF"],
      cons: ["Heavy"],
    });

    expect(node["@type"]).toBe("Product");
    expect(node["@id"]).toBe(`${BASE}/gear/test-camera`);
    const review = node.review as Record<string, unknown>;
    expect(review.positiveNotes).toMatchObject({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Great sensor" },
        { "@type": "ListItem", position: 2, name: "Fast AF" },
      ],
    });
    expect(review.negativeNotes).toMatchObject({
      itemListElement: [{ position: 1, name: "Heavy" }],
    });
  });

  it("omits empty pros/cons lists and falls back to the review page id", () => {
    const node = buildEditorialReviewJsonLd({
      path: "/reviews/opinion",
      headline: "Opinion",
      productName: "Some Gear",
      pros: [],
      cons: [],
    });

    expect(node["@id"]).toBe(`${BASE}/reviews/opinion`);
    const review = node.review as Record<string, unknown>;
    expect(review.positiveNotes).toBeUndefined();
    expect(review.negativeNotes).toBeUndefined();
  });
});

describe("buildArticleJsonLd", () => {
  it("builds a NewsArticle with organization author and dates", () => {
    const node = buildArticleJsonLd({
      type: "NewsArticle",
      path: "/news/big-announcement",
      locale: "en",
      headline: "Big Announcement",
      description: "Something happened.",
      datePublished: "2026-08-01T00:00:00.000Z",
      dateModified: "2026-08-02T00:00:00.000Z",
    });

    expect(node["@type"]).toBe("NewsArticle");
    expect(node.url).toBe(`${BASE}/news/big-announcement`);
    expect(node.author).toEqual({ "@id": `${BASE}/#organization` });
    expect(node.datePublished).toBe("2026-08-01T00:00:00.000Z");
    expect(node.dateModified).toBe("2026-08-02T00:00:00.000Z");
  });

  it("uses the article locale for canonical URLs", () => {
    const node = buildArticleJsonLd({
      type: "Article",
      path: "/learn/exposure",
      locale: "de",
      headline: "Belichtung",
    });

    expect(node["@id"]).toBe(`${BASE}/de/learn/exposure`);
    expect(node.url).toBe(`${BASE}/de/learn/exposure`);
    expect(node.mainEntityOfPage).toBe(`${BASE}/de/learn/exposure`);
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("numbers positions and absolutizes paths, omitting the last item url", () => {
    const node = buildBreadcrumbJsonLd([
      { name: "Gear", path: "/browse" },
      { name: "Nikon", path: "/browse/nikon" },
      { name: "Test Camera" },
    ]);

    expect(node.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Gear",
        item: `${BASE}/browse`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Nikon",
        item: `${BASE}/browse/nikon`,
      },
      { "@type": "ListItem", position: 3, name: "Test Camera" },
    ]);
  });
});

describe("buildWebSiteJsonLd / buildJsonLdGraph", () => {
  it("exposes the search action with the q param and wraps graphs", () => {
    const site = buildWebSiteJsonLd();
    expect(site.potentialAction).toMatchObject({
      "@type": "SearchAction",
      target: {
        urlTemplate: `${BASE}/search?q={search_term_string}`,
      },
    });

    const graph = buildJsonLdGraph([site]);
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"]).toEqual([site]);
  });

  it("drops nullish nodes so ineligible builders can be called inline", () => {
    const site = buildWebSiteJsonLd();
    const graph = buildJsonLdGraph([null, site, undefined]);
    expect(graph["@graph"]).toEqual([site]);
  });
});
