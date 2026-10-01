import type {
  PriceAdapter,
  PriceAdapterMapping,
  PriceFetchResult,
} from "../types";
import { inferCurrencyFromMarket } from "../types";

type JsonLdOffer = {
  price?: string | number;
  lowPrice?: string | number;
  highPrice?: string | number;
  priceCurrency?: string;
};

export function getLocalizedPriceFetchUrl(
  mapping: Pick<PriceAdapterMapping, "sourceKey" | "marketKey"> & {
    fetchUrl: string;
  },
) {
  const url = new URL(mapping.fetchUrl);
  if (mapping.sourceKey === "kamerastore") {
    const countryHint =
      {
        UK: "GB",
        EU: "DE",
      }[mapping.marketKey] ?? null;
    if (countryHint) url.searchParams.set("country", countryHint);
  }
  return url.toString();
}

function parseMinor(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function collectOffers(value: unknown, offers: JsonLdOffer[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectOffers(item, offers);
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.offers) collectOffers(record.offers, offers);
  if ("price" in record || "lowPrice" in record || "highPrice" in record) {
    offers.push(record as JsonLdOffer);
  }
  if (record["@graph"]) collectOffers(record["@graph"], offers);
}

function extractOffers(html: string): JsonLdOffer[] {
  const offers: JsonLdOffer[] = [];
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts ?? []) {
    const body = script.replace(/^.*?>/, "").replace(/<\/script>\s*$/i, "");
    try {
      collectOffers(JSON.parse(body), offers);
    } catch {
      // Some product pages contain multiple malformed JSON-LD blocks. Ignore
      // those blocks and continue looking for a usable offer.
    }
  }
  return offers;
}

export function createJsonLdPriceAdapter(
  sourceKey: "mpb" | "kamerastore",
): PriceAdapter {
  return {
    sourceKey,
    async fetch(mapping: PriceAdapterMapping): Promise<PriceFetchResult> {
      const sourceUrl = mapping.fetchUrl ?? mapping.canonicalUrl;
      if (!sourceUrl) {
        return {
          status: "ERROR",
          observations: [],
          error: "A fetch URL is required for this source.",
        };
      }

      try {
        const fetchUrl = getLocalizedPriceFetchUrl({
          sourceKey: mapping.sourceKey,
          marketKey: mapping.marketKey,
          fetchUrl: sourceUrl,
        });
        const response = await fetch(fetchUrl, {
          headers: { "user-agent": "Sharply price catalog/1.0" },
          redirect: "follow",
        });
        if (!response.ok) {
          return {
            status: "ERROR",
            observations: [],
            error: `Source returned HTTP ${response.status}.`,
          };
        }

        const currency = inferCurrencyFromMarket(mapping.marketKey);
        const offers = extractOffers(await response.text());
        const offer = offers.find((candidate) => {
          const candidateCurrency = candidate.priceCurrency?.toUpperCase();
          return !candidateCurrency || candidateCurrency === currency;
        });
        if (!offer) return { status: "NO_DATA", observations: [] };

        const lowMinor = parseMinor(offer.lowPrice);
        const highMinor = parseMinor(offer.highPrice);
        const amountMinor = parseMinor(offer.price);
        const observedAt = new Date();
        if (lowMinor && highMinor) {
          return {
            status: "SUCCESS",
            observations: [
              {
                valueKind: "RANGE",
                lowMinor,
                highMinor,
                observedAt,
                evidenceUrl: mapping.canonicalUrl ?? fetchUrl,
              },
            ],
          };
        }
        if (amountMinor) {
          return {
            status: "SUCCESS",
            observations: [
              {
                valueKind: "POINT",
                amountMinor,
                observedAt,
                evidenceUrl: mapping.canonicalUrl ?? fetchUrl,
              },
            ],
          };
        }
        return { status: "NO_DATA", observations: [] };
      } catch (error) {
        return {
          status: "ERROR",
          observations: [],
          error:
            error instanceof Error ? error.message : "Source fetch failed.",
        };
      }
    },
  };
}
