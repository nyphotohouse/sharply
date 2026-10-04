import { NextResponse } from "next/server";
import { toTrendingListRowItems } from "~/lib/popularity/trending-display";
import { fetchTrending } from "~/server/popularity/service";

export const revalidate = 120;

export async function GET() {
  const ranking = await fetchTrending({ timeframe: "7d", limit: 10 });
  const items = toTrendingListRowItems(ranking);

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
