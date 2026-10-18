import { type NextRequest, NextResponse } from "next/server";
import { fetchBrowseTrendingRowItems } from "~/server/gear/browse/service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BROWSE_TRENDING_ROW_LIMIT = 3;

/**
 * Live-boosted trending row for browse index and brand pages.
 *
 * Browse pages server-render the stable 24h ranking so the live snapshot's
 * short cache cannot shorten their ISR window; this route lets the client
 * apply today's live boost afterwards. Responses are CDN-cached briefly per
 * brand, matching the home trending route.
 */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId") ?? undefined;
  if (brandId && !UUID_PATTERN.test(brandId)) {
    return NextResponse.json(
      { error: "brandId must be a valid UUID" },
      { status: 400 },
    );
  }

  const items = await fetchBrowseTrendingRowItems({
    brandId,
    limit: BROWSE_TRENDING_ROW_LIMIT,
  });

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Vercel-CDN-Cache-Control":
          "public, s-maxage=120, stale-while-revalidate=60",
      },
    },
  );
}
