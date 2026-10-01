import { NextResponse } from "next/server";
import { getExchangeRates } from "~/server/pricing/exchange-rates";

export async function GET() {
  const rates = await getExchangeRates();
  if (!rates) {
    return NextResponse.json(
      { error: "Exchange rates are temporarily unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json(rates);
}
