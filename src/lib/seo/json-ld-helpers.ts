import { defaultLocale, type Locale } from "~/i18n/config";
import { getLocalizedUrl } from "~/i18n/routing";
import { BRANDS, SENSOR_FORMATS } from "~/lib/generated";
import { getDisplayPrice } from "~/lib/pricing/display-price";
import type { GearItem, GearType } from "~/types/gear";

export type JsonLdNode = Record<string, unknown>;

const SITE_NAME = "Sharply";
const DISCORD_INVITE_URL = "https://discord.gg/8qSXVurbw6";

function getOrigin(): string {
  return getLocalizedUrl("/", defaultLocale).replace(/\/$/, "");
}

function getWebsiteId(): string {
  return `${getOrigin()}/#website`;
}

function getOrganizationId(): string {
  return `${getOrigin()}/#organization`;
}

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${getOrigin()}${url.startsWith("/") ? url : `/${url}`}`;
}

/** Formats a Drizzle decimal (string) or number without trailing zeros. */
function formatNumeric(value: string | number): string | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return String(parsed);
}

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Wraps nodes in a single schema.org @graph document. Nodes may reference
 * each other (and the sitewide WebSite/Organization nodes rendered by the
 * locale layout) via `{"@id": ...}`. Nullish entries are dropped so
 * builders can return null when a node would be ineligible.
 */
export function buildJsonLdGraph(
  nodes: Array<JsonLdNode | null | undefined>,
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((node): node is JsonLdNode => node != null),
  };
}

export function buildWebSiteJsonLd(): JsonLdNode {
  const origin = getOrigin();
  return {
    "@type": "WebSite",
    "@id": getWebsiteId(),
    name: SITE_NAME,
    url: `${origin}/`,
    publisher: { "@id": getOrganizationId() },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildOrganizationJsonLd(): JsonLdNode {
  const origin = getOrigin();
  return {
    "@type": "Organization",
    "@id": getOrganizationId(),
    name: SITE_NAME,
    url: `${origin}/`,
    logo: {
      "@type": "ImageObject",
      url: `${origin}/og-default.png`,
    },
    sameAs: [DISCORD_INVITE_URL],
  };
}

export type BreadcrumbJsonLdItem = {
  name: string;
  /** App-relative path (e.g. "/browse/nikon"). Omit for the current page. */
  path?: string;
};

export function buildBreadcrumbJsonLd(
  items: BreadcrumbJsonLdItem[],
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: getLocalizedUrl(item.path, defaultLocale) } : {}),
    })),
  };
}

export type GearJsonLdSpec = {
  name: string;
  value: string;
};

export function getGearKeySpecs(item: GearItem): GearJsonLdSpec[] {
  const specs: GearJsonLdSpec[] = [];

  if (item.cameraSpecs) {
    const { resolutionMp, sensorFormatId, hasIbis } = item.cameraSpecs;
    if (resolutionMp != null) {
      const formatted = formatNumeric(resolutionMp);
      if (formatted) {
        specs.push({ name: "Sensor Resolution", value: `${formatted} MP` });
      }
    }
    if (sensorFormatId) {
      const sensorFormat = SENSOR_FORMATS.find((s) => s.id === sensorFormatId);
      if (sensorFormat) {
        specs.push({ name: "Sensor Format", value: sensorFormat.name });
      }
    }
    if (hasIbis != null) {
      specs.push({
        name: "In-Body Stabilization",
        value: hasIbis ? "Yes" : "No",
      });
    }
  }

  if (item.lensSpecs) {
    const { focalLengthMinMm, focalLengthMaxMm, maxApertureWide } =
      item.lensSpecs;
    const minFocal =
      focalLengthMinMm != null ? formatNumeric(focalLengthMinMm) : null;
    const maxFocal =
      focalLengthMaxMm != null ? formatNumeric(focalLengthMaxMm) : null;
    if (minFocal) {
      specs.push({
        name: "Focal Length",
        value:
          maxFocal && maxFocal !== minFocal
            ? `${minFocal}-${maxFocal} mm`
            : `${minFocal} mm`,
      });
    }
    const aperture =
      maxApertureWide != null ? formatNumeric(maxApertureWide) : null;
    if (aperture) {
      specs.push({ name: "Maximum Aperture", value: `f/${aperture}` });
    }
  }

  if (item.weightGrams != null && item.weightGrams > 0) {
    specs.push({ name: "Weight", value: `${item.weightGrams} g` });
  }

  return specs;
}

/**
 * Only emit actual offer-like legacy values. The used-price projection is a
 * derived estimate, not a purchasable listing, so it must not be emitted as a
 * schema.org Offer even though it is the preferred visible display value.
 */
function buildGearOfferJsonLd(item: GearItem): JsonLdNode | null {
  const displayPrice = getDisplayPrice(item, { market: "US" });
  if (
    displayPrice.value?.kind !== "POINT" ||
    displayPrice.source === "USED_ESTIMATE"
  ) {
    return null;
  }

  if (displayPrice.source === "LEGACY_MPB") {
    return {
      "@type": "Offer",
      price: centsToPrice(displayPrice.value.amountMinor),
      priceCurrency: "USD",
      itemCondition: "https://schema.org/UsedCondition",
      ...(item.linkMpb ? { url: item.linkMpb } : {}),
    };
  }

  if (displayPrice.source === "MSRP_NOW") {
    return {
      "@type": "Offer",
      price: centsToPrice(displayPrice.value.amountMinor),
      priceCurrency: "USD",
      itemCondition: "https://schema.org/NewCondition",
    };
  }
  return null;
}

function getGearCategoryLabel(gearType: GearType | null | undefined) {
  if (gearType === "CAMERA" || gearType === "ANALOG_CAMERA") return "Camera";
  if (gearType === "LENS") return "Lens";
  return null;
}

export type GearProductJsonLdInput = {
  item: GearItem;
  /** Regionalized display name as shown on the page. */
  displayName: string;
  description?: string | null;
  imageUrl?: string | null;
};

/**
 * Google renders Product snippets only when one of `offers`, `review`, or
 * `aggregateRating` is present; a Product with none of them is reported as
 * a Search Console critical issue and can never produce a rich result.
 * An offer from the displayed price is the only one of the three emitted
 * today (nesting staff verdicts / editorial reviews as `review` is
 * deliberately deferred until the review system is built out), so items
 * without price data emit no Product node at all.
 */
export function buildGearProductJsonLd(
  input: GearProductJsonLdInput,
): JsonLdNode | null {
  const { item, displayName, description, imageUrl } = input;

  const offer = buildGearOfferJsonLd(item);
  if (!offer) return null;

  const canonicalUrl = getLocalizedUrl(`/gear/${item.slug}`, defaultLocale);

  const product: JsonLdNode = {
    "@type": "Product",
    additionalType: "https://schema.org/ProductModel",
    "@id": canonicalUrl,
    url: canonicalUrl,
    name: displayName,
    offers: offer,
  };

  if (description) {
    product.description = description;
  }

  const brand = BRANDS.find((b) => b.id === item.brandId);
  if (brand) {
    product.brand = {
      "@type": "Brand",
      name: brand.name,
      url: getLocalizedUrl(`/browse/${brand.slug}`, defaultLocale),
    };
  }

  if (imageUrl) {
    product.image = toAbsoluteUrl(imageUrl);
  }

  const category = getGearCategoryLabel(item.gearType);
  if (category) {
    product.category = category;
  }

  const keySpecs = getGearKeySpecs(item);
  if (keySpecs.length > 0) {
    product.additionalProperty = keySpecs.map((spec) => ({
      "@type": "PropertyValue",
      name: spec.name,
      value: spec.value,
    }));
  }

  return product;
}

export type ArticleJsonLdInput = {
  type: "Article" | "NewsArticle";
  /** App-relative path of the article (e.g. "/news/some-post"). */
  path: string;
  locale: Locale;
  headline: string;
  description?: string | null;
  imageUrl?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
};

export function buildArticleJsonLd(input: ArticleJsonLdInput): JsonLdNode {
  const canonicalUrl = getLocalizedUrl(input.path, input.locale);
  const article: JsonLdNode = {
    "@type": input.type,
    "@id": canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    headline: input.headline,
    author: { "@id": getOrganizationId() },
    publisher: { "@id": getOrganizationId() },
  };

  if (input.description) article.description = input.description;
  if (input.imageUrl) article.image = toAbsoluteUrl(input.imageUrl);
  if (input.datePublished) article.datePublished = input.datePublished;
  if (input.dateModified) article.dateModified = input.dateModified;

  return article;
}

export type EditorialReviewJsonLdInput = {
  /** App-relative path of the review page (e.g. "/reviews/nikon-z8"). */
  path: string;
  headline: string;
  /** Display name of the reviewed gear. */
  productName: string;
  /** Slug of the reviewed gear item, if linked. */
  gearSlug?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  /** Pros/cons as displayed on the page; emitted only when non-empty. */
  pros: string[];
  cons: string[];
};

/**
 * Product + nested Review with positiveNotes/negativeNotes, targeting
 * Google's editorial pros-and-cons rich result (no star rating required —
 * the 0-3 editorial genre scale doesn't map honestly onto one).
 */
export function buildEditorialReviewJsonLd(
  input: EditorialReviewJsonLdInput,
): JsonLdNode {
  const productId = input.gearSlug
    ? getLocalizedUrl(`/gear/${input.gearSlug}`, defaultLocale)
    : getLocalizedUrl(input.path, defaultLocale);

  const review: JsonLdNode = {
    "@type": "Review",
    name: input.headline,
    url: getLocalizedUrl(input.path, defaultLocale),
    author: { "@id": getOrganizationId() },
    publisher: { "@id": getOrganizationId() },
  };

  if (input.description) review.description = input.description;
  if (input.datePublished) review.datePublished = input.datePublished;
  if (input.dateModified) review.dateModified = input.dateModified;

  if (input.pros.length > 0) {
    review.positiveNotes = {
      "@type": "ItemList",
      itemListElement: input.pros.map((note, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: note,
      })),
    };
  }

  if (input.cons.length > 0) {
    review.negativeNotes = {
      "@type": "ItemList",
      itemListElement: input.cons.map((note, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: note,
      })),
    };
  }

  const product: JsonLdNode = {
    "@type": "Product",
    "@id": productId,
    name: input.productName,
    review,
  };

  if (input.imageUrl) product.image = toAbsoluteUrl(input.imageUrl);

  return product;
}
