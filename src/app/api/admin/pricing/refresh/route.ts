export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { syncCampricerService } from "~/server/pricing/campricer";
import { env } from "~/env";
import { revalidateGearPages } from "~/server/revalidation";
import { refreshDuePriceMappingsService } from "~/server/pricing/service";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Sequential batches avoid competing projection rebuilds for the same gear.
    // Each failure is isolated so the other source pipeline still runs.
    const [mappingResult] = await Promise.allSettled([
      refreshDuePriceMappingsService(20),
    ]);
    const [importResult] = await Promise.allSettled([syncCampricerService()]);
    const slugs = new Set<string>();
    for (const outcome of [mappingResult, importResult]) {
      if (outcome.status === "fulfilled")
        for (const slug of outcome.value.gearSlugs) slugs.add(slug);
    }
    revalidateGearPages(Array.from(slugs));
    const ok =
      mappingResult.status === "fulfilled" &&
      importResult.status === "fulfilled" &&
      importResult.value.ok;
    return NextResponse.json(
      {
        ok,
        result:
          mappingResult.status === "fulfilled"
            ? mappingResult.value
            : { error: "Mapping refresh failed" },
        campricer:
          importResult.status === "fulfilled"
            ? importResult.value
            : { error: "Source import failed" },
      },
      { status: ok ? 200 : 500 },
    );
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
