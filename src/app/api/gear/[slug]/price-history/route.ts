import { type NextRequest, NextResponse } from "next/server";
import { getPublicPriceHistoryService } from "~/server/pricing/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const history = await getPublicPriceHistoryService(
      slug,
      request.nextUrl.searchParams.get("market") ?? "",
    );
    return NextResponse.json(history);
  } catch (error) {
    const status = (error as { status?: number }).status;
    return NextResponse.json(
      {
        error:
          status === 400
            ? "Invalid market"
            : status === 404
              ? "Gear not found"
              : "Price history unavailable",
      },
      { status: status === 400 || status === 404 ? status : 500 },
    );
  }
}
