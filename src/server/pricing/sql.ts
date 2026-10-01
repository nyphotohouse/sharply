import { sql, type SQL } from "drizzle-orm";
import { gear } from "~/server/db/schema";

/**
 * Builds the canonical US/USD comparison value used by server-side price
 * sorting and filtering. The JSON projection is intentionally guarded before
 * casting so a malformed legacy value behaves like an unavailable estimate.
 */
export function buildUsComparablePriceSql(): SQL {
  const projectedTypical = sql<number | null>`CASE
    WHEN ${gear.usedPriceProjection}->'US'->>'status' IN ('current', 'stale')
      AND ${gear.usedPriceProjection}->'US'->>'typical' ~ '^[1-9][0-9]*$'
    THEN (${gear.usedPriceProjection}->'US'->>'typical')::integer
    ELSE NULL
  END`;

  return sql<number | null>`COALESCE(
    ${projectedTypical},
    ${gear.mpbMaxPriceUsdCents},
    ${gear.msrpNowUsdCents},
    ${gear.msrpAtLaunchUsdCents}
  )`;
}

export function buildUsHasComparablePriceSql(): SQL {
  return sql`${buildUsComparablePriceSql()} IS NOT NULL`;
}
