export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { env } from "~/env";
import { revalidateGearPages } from "~/server/revalidation";
import { refreshDuePriceMappingsService } from "~/server/pricing/service";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshDuePriceMappingsService(20);
    revalidateGearPages(result.gearSlugs);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[pricing-cron] refresh failed", error);
    return NextResponse.json(
      { ok: false, error: "Pricing refresh failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
