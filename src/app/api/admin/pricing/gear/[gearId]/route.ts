import { NextResponse } from "next/server";
import { getPriceManagementService } from "~/server/pricing/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gearId: string }> },
) {
  try {
    const { gearId } = await params;
    return NextResponse.json(await getPriceManagementService(gearId));
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    const message =
      error instanceof Error ? error.message : "Failed to load pricing data.";
    return NextResponse.json({ ok: false, message }, { status });
  }
}
