import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from "payload";

type EditorialCollection = "news" | "review" | "learn-pages";
type EditorialDocument = {
  _status?: string | null;
  slug?: string | null;
  review_gear_item?: string | null;
  related_gear_items?: unknown;
};

function getRevalidationUrl(): URL | null {
  const appOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : null));

  if (!appOrigin) return null;
  return new URL("/api/revalidate/editorial", appOrigin);
}

async function requestEditorialRevalidation(
  collection: EditorialCollection,
  documents: EditorialDocument[],
) {
  const secret = process.env.PAYLOAD_SECRET;
  const url = getRevalidationUrl();
  if (!secret || !url) return;

  const safeDocuments = documents.map((document) => ({
    slug: document.slug,
    relatedGearSlugs:
      typeof document.review_gear_item === "string"
        ? [document.review_gear_item]
        : Array.isArray(document.related_gear_items)
          ? document.related_gear_items.filter(
              (slug): slug is string => typeof slug === "string",
            )
          : [],
  }));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ collection, documents: safeDocuments }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "[payload-revalidation] Revalidation endpoint returned an error",
        {
          collection,
          status: response.status,
        },
      );
    }
  } catch (error) {
    console.error(
      "[payload-revalidation] Could not reach revalidation endpoint",
      {
        collection,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

function shouldRevalidate(
  req: Parameters<CollectionAfterChangeHook>[0]["req"],
): boolean {
  if (req.searchParams?.get("autosave") === "true") return false;
  if (
    req.searchParams?.get("draft") === "true" &&
    req.data?._status !== "published"
  ) {
    return false;
  }

  return true;
}

function hasPublicPath(req: Parameters<CollectionAfterChangeHook>[0]["req"]) {
  // Local API calls (such as the E2E bootstrap script) do not have an HTTP
  // origin and cannot invalidate a running Next.js cache.
  return Boolean(req.origin);
}

function getInvalidationDocuments(
  ...documents: Array<EditorialDocument | null | undefined>
) {
  return documents.filter(
    (document): document is EditorialDocument => document != null,
  );
}

export function createEditorialAfterChangeHook(
  collection: EditorialCollection,
): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, req }) => {
    if (!shouldRevalidate(req) || !hasPublicPath(req)) return doc;

    const wasPublished = previousDoc?._status === "published";
    const isPublished = doc._status === "published";
    if (!wasPublished && !isPublished) return doc;

    await requestEditorialRevalidation(
      collection,
      getInvalidationDocuments(previousDoc, doc),
    );

    return doc;
  };
}

export function createEditorialAfterDeleteHook(
  collection: EditorialCollection,
): CollectionAfterDeleteHook {
  return async ({ doc, req }) => {
    if (doc._status === "published" && hasPublicPath(req)) {
      await requestEditorialRevalidation(collection, [doc]);
    }
    return doc;
  };
}
