export const runtime = "nodejs";
export const maxDuration = 300;

import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { dispatchDueDeveloperWebhookDeliveries } from "~/server/developer-api/webhooks/service";

async function handleFlush(request: NextRequest) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await dispatchDueDeveloperWebhookDeliveries();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[developer-webhooks] scheduled flush failed", error);
    return NextResponse.json(
      { ok: false, error: "Webhook delivery flush failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleFlush(request);
}

export async function POST(request: NextRequest) {
  return handleFlush(request);
}
