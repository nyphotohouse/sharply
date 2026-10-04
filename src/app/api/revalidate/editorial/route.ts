import { timingSafeEqual } from "node:crypto";
import {
  revalidateEditorialContent,
  type EditorialCollection,
} from "~/server/revalidation";

export const runtime = "nodejs";

const editorialCollections = new Set<EditorialCollection>([
  "news",
  "review",
  "learn-pages",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value)
  );
}

function hasValidAuthorization(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export async function POST(request: Request) {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Revalidation is not configured." },
      { status: 503 },
    );
  }
  if (!hasValidAuthorization(request, secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.collection !== "string" ||
    !editorialCollections.has(body.collection as EditorialCollection) ||
    !Array.isArray(body.documents) ||
    body.documents.length === 0 ||
    body.documents.length > 4
  ) {
    return Response.json(
      { error: "Invalid editorial revalidation request." },
      { status: 400 },
    );
  }

  const documents = body.documents.filter(isRecord).map((document) => ({
    slug: isSlug(document.slug) ? document.slug : null,
    relatedGearSlugs: Array.isArray(document.relatedGearSlugs)
      ? document.relatedGearSlugs.filter(isSlug)
      : [],
  }));

  revalidateEditorialContent(body.collection as EditorialCollection, documents);

  return Response.json({ revalidated: true });
}
