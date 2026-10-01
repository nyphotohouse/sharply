import "server-only";

import type { AuthUser } from "~/auth";
import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";
import {
  addPriceObservationData,
  addPublicPriceObservationData,
  archiveOrDeletePriceMappingData,
  completePriceFetchRunData,
  createPriceMappingData,
  createPriceFetchRunData,
  getPriceManagementData,
  getPriceMappingData,
  listDuePriceMappingsData,
  listRecentPriceFetchRunsData,
  listRecentPriceObservationsData,
  listPriceOverviewData,
  listUpcomingPriceMappingsData,
  recordPriceFetchRunItemData,
  restorePriceMappingData,
  reviewPriceObservationData,
  updatePriceMappingLinkData,
  updatePriceMappingFetchData,
} from "./data";
import { getPriceAdapter } from "./adapters";
import { rebuildGearPriceProjection } from "./projection";
import {
  PRICE_MARKETS,
  PRICE_SOURCE_KEYS,
  getManualRefreshRetryAt,
  getPriceFetchRunStatus,
  hasRequiredPriceSourceLink,
  inferCurrencyFromMarket,
} from "./types";

function unauthorized(): never {
  throw Object.assign(new Error("Unauthorized"), { status: 401 });
}

function requirePricingRole(user: AuthUser | null | undefined) {
  if (!requireRole(user, ["EDITOR"])) unauthorized();
}

function isAdmin(user: AuthUser | null | undefined): boolean {
  return requireRole(user, ["ADMIN"]);
}

function assertAllowedValue(
  value: string,
  allowed: readonly string[],
  message: string,
) {
  if (!allowed.includes(value)) {
    throw Object.assign(new Error(message), { status: 400 });
  }
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error();
    return url.toString();
  } catch {
    throw Object.assign(new Error("URLs must use http or https."), {
      status: 400,
    });
  }
}

export async function getPriceManagementService(gearId: string) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  return getPriceManagementData(gearId);
}

export async function listPriceOverviewService() {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  return listPriceOverviewData();
}

export async function listPriceFetchRunsService(limit = 12) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  return listRecentPriceFetchRunsData(Math.min(Math.max(limit, 1), 50));
}

export async function listUpcomingPriceMappingsService(limit = 8) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  return listUpcomingPriceMappingsData(Math.min(Math.max(limit, 1), 50));
}

export async function listRecentPriceObservationsService(limit = 30) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  return listRecentPriceObservationsData(Math.min(Math.max(limit, 1), 100));
}

export async function createPriceMappingService(input: {
  gearId: string;
  sourceKey: string;
  marketKey: string;
  priceKind?: string;
  externalProductId?: string | null;
  canonicalUrl?: string | null;
  fetchUrl?: string | null;
}) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  assertAllowedValue(
    input.sourceKey,
    PRICE_SOURCE_KEYS,
    "Unknown price source.",
  );
  if (input.sourceKey === "manual") {
    throw Object.assign(
      new Error("Manual mappings are created when adding an observation."),
      { status: 400 },
    );
  }
  assertAllowedValue(input.marketKey, PRICE_MARKETS, "Unknown price market.");
  const priceKind = input.priceKind?.trim() || "used_retail";
  if (priceKind !== "used_retail") {
    throw Object.assign(
      new Error("Only used retail pricing is supported yet."),
      {
        status: 400,
      },
    );
  }

  const canonicalUrl = normalizeOptionalUrl(input.canonicalUrl);
  const fetchUrl = normalizeOptionalUrl(input.fetchUrl);
  if (!hasRequiredPriceSourceLink(input.sourceKey, canonicalUrl, fetchUrl)) {
    throw Object.assign(
      new Error("A product link is required for automatic price sources."),
      { status: 400 },
    );
  }

  return createPriceMappingData({
    gearId: input.gearId,
    sourceKey: input.sourceKey,
    marketKey: input.marketKey,
    priceKind,
    externalProductId: input.externalProductId?.trim() || null,
    canonicalUrl,
    fetchUrl,
    createdById: session.user.id,
  });
}

type ManualPriceObservationInput = {
  valueKind: "POINT" | "RANGE";
  amountMinor?: number | null;
  lowMinor?: number | null;
  highMinor?: number | null;
  condition?: string;
  availability?: string;
  observedAt?: Date;
  evidenceUrl?: string | null;
  note?: string | null;
};

function validateManualObservation(input: ManualPriceObservationInput) {
  if (input.valueKind !== "POINT" && input.valueKind !== "RANGE") {
    throw Object.assign(new Error("Unknown price value kind."), {
      status: 400,
    });
  }
  const observedAt = input.observedAt ?? new Date();
  const amountMinor = input.amountMinor ?? null;
  const lowMinor = input.lowMinor ?? null;
  const highMinor = input.highMinor ?? null;
  if (
    input.valueKind === "POINT" &&
    !(
      typeof amountMinor === "number" &&
      Number.isInteger(amountMinor) &&
      amountMinor > 0
    )
  ) {
    throw Object.assign(
      new Error("A point price must be a positive integer."),
      {
        status: 400,
      },
    );
  }
  if (
    input.valueKind === "RANGE" &&
    !(
      typeof lowMinor === "number" &&
      typeof highMinor === "number" &&
      Number.isInteger(lowMinor) &&
      Number.isInteger(highMinor) &&
      lowMinor > 0 &&
      highMinor >= lowMinor
    )
  ) {
    throw Object.assign(new Error("A price range must contain valid bounds."), {
      status: 400,
    });
  }

  return { observedAt, amountMinor, lowMinor, highMinor };
}

async function addManualObservationToMapping(
  mapping: NonNullable<Awaited<ReturnType<typeof getPriceMappingData>>>,
  input: ManualPriceObservationInput,
  createdById: string,
) {
  const currency = inferCurrencyFromMarket(mapping.marketKey);
  const { observedAt, amountMinor, lowMinor, highMinor } =
    validateManualObservation(input);

  await addPriceObservationData({
    mappingId: mapping.id,
    createdById,
    currency,
    valueKind: input.valueKind,
    amountMinor,
    lowMinor,
    highMinor,
    condition: input.condition?.trim() || "unknown",
    availability: input.availability?.trim() || "available",
    observedAt,
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    note: input.note?.trim() || null,
  });

  await rebuildGearPriceProjection(mapping.gearId);
  return getPriceManagementData(mapping.gearId);
}

export async function addManualPriceObservationForGearService(
  input: {
    gearId: string;
    marketKey: string;
  } & ManualPriceObservationInput,
) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  assertAllowedValue(input.marketKey, PRICE_MARKETS, "Unknown price market.");
  validateManualObservation(input);

  const mapping = await createPriceMappingData({
    gearId: input.gearId,
    sourceKey: "manual",
    marketKey: input.marketKey,
    priceKind: "used_retail",
    createdById: session.user.id,
  });

  return addManualObservationToMapping(mapping, input, session.user.id);
}

/**
 * Lets an authenticated contributor seed an item with its first price. It is
 * intentionally separate from the editor-only manual observation path so the
 * public contribution can be live immediately while remaining reviewable.
 */
export async function addPublicPriceObservationService(
  input: {
    gearId: string;
    marketKey: string;
  } & ManualPriceObservationInput,
) {
  const session = await getSessionOrThrow();
  assertAllowedValue(input.marketKey, PRICE_MARKETS, "Unknown price market.");
  const { observedAt, amountMinor, lowMinor, highMinor } =
    validateManualObservation(input);

  const result = await addPublicPriceObservationData({
    gearId: input.gearId,
    marketKey: input.marketKey,
    createdById: session.user.id,
    currency: inferCurrencyFromMarket(input.marketKey),
    valueKind: input.valueKind,
    amountMinor,
    lowMinor,
    highMinor,
    observedAt,
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    note: input.note?.trim() || null,
  });

  if (!result.created) {
    throw Object.assign(new Error("PRICE_ALREADY_EXISTS"), {
      status: 409,
      code: "PRICE_ALREADY_EXISTS",
    });
  }

  const projection = await rebuildGearPriceProjection(result.gearId);
  return { ...result, projection };
}

export async function reviewPriceObservationService(input: {
  observationId: string;
  decision: "APPROVE" | "REJECT";
}) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  const result = await reviewPriceObservationData(input);
  if (!result) {
    throw Object.assign(new Error("Price observation not found"), {
      status: 404,
    });
  }

  if (input.decision === "REJECT") {
    await rebuildGearPriceProjection(result.gearId);
  }

  return result;
}

export async function updatePriceMappingLinkService(input: {
  mappingId: string;
  url: string | null;
}) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  const mapping = await getPriceMappingData(input.mappingId);
  if (!mapping) {
    throw Object.assign(new Error("Price mapping not found"), { status: 404 });
  }

  const url = normalizeOptionalUrl(input.url);
  if (!hasRequiredPriceSourceLink(mapping.sourceKey, url, url)) {
    throw Object.assign(
      new Error("A product link is required for automatic price sources."),
      { status: 400 },
    );
  }

  const existingUrl = mapping.fetchUrl ?? mapping.canonicalUrl;
  const linkChanged = existingUrl !== url;
  const updated = await updatePriceMappingLinkData({
    mappingId: mapping.id,
    canonicalUrl: url,
    fetchUrl: url,
    deleteObservations: linkChanged,
  });
  if (!updated) {
    throw Object.assign(new Error("Price mapping not found"), { status: 404 });
  }
  if (linkChanged) {
    await rebuildGearPriceProjection(mapping.gearId);
  }
  return updated;
}

type RefreshOptions = {
  actorId: string | null;
  bypassCooldown: boolean;
};

async function refreshPriceMappingInternal(
  mappingId: string,
  options: RefreshOptions,
) {
  const mapping = await getPriceMappingData(mappingId);
  if (!mapping) {
    throw Object.assign(new Error("Price mapping not found"), { status: 404 });
  }
  if (mapping.status !== "ACTIVE") {
    throw Object.assign(new Error("This price mapping is disabled."), {
      status: 400,
    });
  }

  const retryAt = getManualRefreshRetryAt(mapping.lastFetchedAt);
  if (!options.bypassCooldown && retryAt) {
    return {
      ok: false as const,
      code: "COOLDOWN" as const,
      retryAt: retryAt.toISOString(),
    };
  }

  const adapter = getPriceAdapter(mapping.sourceKey);
  if (!adapter || mapping.sourceKey === "manual") {
    throw Object.assign(
      new Error("Manual mappings are updated by adding an observation."),
      { status: 400 },
    );
  }

  const fetchedAt = new Date();
  const result = await adapter.fetch(mapping);
  const nextFetchAt = new Date(
    fetchedAt.getTime() +
      (result.status === "ERROR" ? 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000),
  );
  const currency = inferCurrencyFromMarket(mapping.marketKey);
  await updatePriceMappingFetchData({
    mappingId,
    fetchedAt,
    nextFetchAt,
    status: result.status,
    error: result.error,
    observations: result.observations,
    currency,
    createdById: options.actorId,
  });

  if (result.observations.length > 0) {
    await rebuildGearPriceProjection(mapping.gearId);
  }

  return {
    ok: true as const,
    status: result.status,
    insertedObservationCount: result.observations.length,
    nextFetchAt: nextFetchAt.toISOString(),
  };
}

export async function refreshPriceMappingService(mappingId: string) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  return refreshPriceMappingInternal(mappingId, {
    actorId: session.user.id,
    bypassCooldown: isAdmin(session.user),
  });
}

export async function recalculateGearPricingService(gearId: string) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  return rebuildGearPriceProjection(gearId);
}

export async function archiveOrDeletePriceMappingService(mappingId: string) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  const result = await archiveOrDeletePriceMappingData(mappingId);
  if (!result) {
    throw Object.assign(new Error("Price mapping not found"), { status: 404 });
  }
  if (result.action === "archived") {
    await rebuildGearPriceProjection(result.mapping.gearId);
  }
  return result;
}

export async function restorePriceMappingService(mappingId: string) {
  const session = await getSessionOrThrow();
  requirePricingRole(session.user);
  const mapping = await restorePriceMappingData(mappingId);
  if (!mapping) {
    throw Object.assign(new Error("Archived price mapping not found"), {
      status: 404,
    });
  }
  await rebuildGearPriceProjection(mapping.gearId);
  return mapping;
}

export async function refreshDuePriceMappingsService(limit = 20) {
  const run = await createPriceFetchRunData();
  try {
    const mappings = await listDuePriceMappingsData(
      Math.min(Math.max(limit, 1), 50),
    );
    const results: Array<{ mappingId: string; status: string }> = [];
    const gearSlugs = new Set<string>();
    let successCount = 0;
    let noDataCount = 0;
    let errorCount = 0;

    for (const mapping of mappings) {
      const itemStartedAt = new Date();
      try {
        const result = await refreshPriceMappingInternal(mapping.id, {
          actorId: null,
          bypassCooldown: true,
        });
        const itemStatus = result.ok ? result.status : "ERROR";
        const itemError = result.ok ? null : result.code;
        if (itemStatus === "SUCCESS") successCount += 1;
        if (itemStatus === "NO_DATA") noDataCount += 1;
        if (itemStatus === "ERROR") errorCount += 1;
        results.push({
          mappingId: mapping.id,
          status: result.ok ? result.status : result.code,
        });
        if (result.ok) gearSlugs.add(mapping.gearSlug);
        await recordPriceFetchRunItemData({
          runId: run.id,
          mappingId: mapping.id,
          gearId: mapping.gearId,
          gearName: mapping.gearName,
          gearSlug: mapping.gearSlug,
          sourceKey: mapping.sourceKey,
          marketKey: mapping.marketKey,
          status: itemStatus,
          insertedObservationCount: result.ok
            ? result.insertedObservationCount
            : 0,
          startedAt: itemStartedAt,
          completedAt: new Date(),
          nextFetchAt: result.ok ? new Date(result.nextFetchAt) : null,
          error: itemError,
        });
      } catch (error) {
        errorCount += 1;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        results.push({
          mappingId: mapping.id,
          status: message,
        });
        await recordPriceFetchRunItemData({
          runId: run.id,
          mappingId: mapping.id,
          gearId: mapping.gearId,
          gearName: mapping.gearName,
          gearSlug: mapping.gearSlug,
          sourceKey: mapping.sourceKey,
          marketKey: mapping.marketKey,
          status: "ERROR",
          insertedObservationCount: 0,
          startedAt: itemStartedAt,
          completedAt: new Date(),
          error: message,
        });
      }
    }

    const status = getPriceFetchRunStatus(
      successCount,
      noDataCount,
      errorCount,
    );
    await completePriceFetchRunData({
      runId: run.id,
      status,
      scannedCount: mappings.length,
      successCount,
      noDataCount,
      errorCount,
    });
    return {
      runId: run.id,
      scanned: mappings.length,
      results,
      gearSlugs: Array.from(gearSlugs),
    };
  } catch (error) {
    await completePriceFetchRunData({
      runId: run.id,
      status: "ERROR",
      scannedCount: 0,
      successCount: 0,
      noDataCount: 0,
      errorCount: 1,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
