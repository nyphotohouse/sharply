import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { db } from "~/server/db";
import {
  gear,
  gearPriceEstimates,
  gearPriceFetchRunItems,
  gearPriceFetchRuns,
  gearPriceMappings,
  gearPriceObservations,
  users,
} from "~/server/db/schema";
import type { GearPriceProjection } from "~/server/db/schema";
import type {
  PriceAdapterMapping,
  PriceAdapterObservation,
  PriceFetchResult,
  PriceOverviewRow,
} from "./types";
import { getUpcomingFetchCutoff } from "~/lib/pricing/upcoming-fetch-window";

export type PriceEstimateInsert = Omit<
  typeof gearPriceEstimates.$inferInsert,
  "gearId"
>;

export async function getPriceManagementData(gearId: string) {
  const [gearRow] = await db
    .select({
      id: gear.id,
      name: gear.name,
      slug: gear.slug,
      usedPriceProjection: gear.usedPriceProjection,
    })
    .from(gear)
    .where(eq(gear.id, gearId))
    .limit(1);

  if (!gearRow) {
    throw Object.assign(new Error("Gear item not found"), { status: 404 });
  }

  const [mappings, estimates] = await Promise.all([
    db
      .select()
      .from(gearPriceMappings)
      .where(
        and(
          eq(gearPriceMappings.gearId, gearId),
          ne(gearPriceMappings.sourceKey, "manual"),
        ),
      )
      .orderBy(
        asc(gearPriceMappings.marketKey),
        asc(gearPriceMappings.sourceKey),
      ),
    db
      .select({
        id: gearPriceEstimates.id,
        marketKey: gearPriceEstimates.marketKey,
        priceKind: gearPriceEstimates.priceKind,
        lowMinor: gearPriceEstimates.lowMinor,
        typicalMinor: gearPriceEstimates.typicalMinor,
        highMinor: gearPriceEstimates.highMinor,
        currency: gearPriceEstimates.currency,
        asOf: gearPriceEstimates.asOf,
        methodVersion: gearPriceEstimates.methodVersion,
        sourceCount: gearPriceEstimates.sourceCount,
        observationCount: gearPriceEstimates.observationCount,
      })
      .from(gearPriceEstimates)
      .where(eq(gearPriceEstimates.gearId, gearId))
      .orderBy(
        desc(gearPriceEstimates.asOf),
        desc(gearPriceEstimates.createdAt),
        desc(gearPriceEstimates.id),
      ),
  ]);

  const mappingIds = mappings.map((mapping) => mapping.id);
  const observations = mappingIds.length
    ? await db
        .select()
        .from(gearPriceObservations)
        .where(inArray(gearPriceObservations.mappingId, mappingIds))
        .orderBy(desc(gearPriceObservations.observedAt))
    : [];
  const observationsByMapping = new Map<string, typeof observations>();
  for (const observation of observations) {
    const current = observationsByMapping.get(observation.mappingId) ?? [];
    current.push(observation);
    observationsByMapping.set(observation.mappingId, current);
  }

  const currentProjectionKeys = new Set(
    Object.keys(gearRow.usedPriceProjection ?? {}),
  );
  const latestEstimatesByKey = new Map<string, (typeof estimates)[number]>();
  for (const estimate of estimates) {
    const key =
      estimate.priceKind === "used_retail"
        ? estimate.marketKey
        : `${estimate.marketKey}:${estimate.priceKind}`;
    if (currentProjectionKeys.has(key) && !latestEstimatesByKey.has(key)) {
      latestEstimatesByKey.set(key, estimate);
    }
  }

  return {
    gear: gearRow,
    mappings: mappings.map((mapping) => ({
      ...mapping,
      observations: observationsByMapping.get(mapping.id) ?? [],
    })),
    estimates: Array.from(latestEstimatesByKey.values()),
  };
}

export async function getPriceMappingData(mappingId: string) {
  const [mapping] = await db
    .select()
    .from(gearPriceMappings)
    .where(eq(gearPriceMappings.id, mappingId))
    .limit(1);
  return mapping ?? null;
}

export async function createPriceMappingData(input: {
  gearId: string;
  sourceKey: string;
  marketKey: string;
  priceKind: string;
  externalProductId?: string | null;
  canonicalUrl?: string | null;
  fetchUrl?: string | null;
  createdById: string;
}) {
  const now = new Date();
  const [mapping] = await db
    .insert(gearPriceMappings)
    .values({
      gearId: input.gearId,
      sourceKey: input.sourceKey,
      marketKey: input.marketKey,
      priceKind: input.priceKind,
      externalProductId: input.externalProductId ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      fetchUrl: input.fetchUrl ?? null,
      createdById: input.createdById,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        gearPriceMappings.gearId,
        gearPriceMappings.sourceKey,
        gearPriceMappings.marketKey,
        gearPriceMappings.priceKind,
      ],
      set: {
        externalProductId: input.externalProductId ?? null,
        canonicalUrl: input.canonicalUrl ?? null,
        fetchUrl: input.fetchUrl ?? null,
        status: "ACTIVE",
        updatedAt: now,
      },
    })
    .returning();

  if (!mapping) throw new Error("Unable to create price mapping");
  return mapping;
}

export async function updatePriceMappingLinkData(input: {
  mappingId: string;
  canonicalUrl: string | null;
  fetchUrl: string | null;
  deleteObservations: boolean;
}) {
  return db.transaction(async (tx) => {
    if (input.deleteObservations) {
      await tx
        .delete(gearPriceObservations)
        .where(eq(gearPriceObservations.mappingId, input.mappingId));
    }

    const [mapping] = await tx
      .update(gearPriceMappings)
      .set({
        canonicalUrl: input.canonicalUrl,
        fetchUrl: input.fetchUrl,
        lastFetchedAt: input.deleteObservations ? null : undefined,
        nextFetchAt: input.deleteObservations ? null : undefined,
        lastFetchStatus: input.deleteObservations ? "NEVER" : undefined,
        lastFetchError: input.deleteObservations ? null : undefined,
        retryCount: input.deleteObservations ? 0 : undefined,
        updatedAt: new Date(),
      })
      .where(eq(gearPriceMappings.id, input.mappingId))
      .returning();
    return mapping ?? null;
  });
}

export async function addPriceObservationData(input: {
  mappingId: string;
  createdById: string;
  currency: string;
  valueKind: "POINT" | "RANGE";
  amountMinor?: number | null;
  lowMinor?: number | null;
  highMinor?: number | null;
  condition: string;
  availability: string;
  observedAt: Date;
  evidenceUrl?: string | null;
  note?: string | null;
  fetchedAt?: Date | null;
  needsReview?: boolean;
}) {
  const [observation] = await db
    .insert(gearPriceObservations)
    .values({
      mappingId: input.mappingId,
      createdById: input.createdById,
      currency: input.currency,
      valueKind: input.valueKind,
      amountMinor: input.amountMinor ?? null,
      lowMinor: input.lowMinor ?? null,
      highMinor: input.highMinor ?? null,
      condition: input.condition,
      availability: input.availability,
      observedAt: input.observedAt,
      fetchedAt: input.fetchedAt ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      note: input.note ?? null,
      needsReview: input.needsReview ?? false,
    })
    .returning();

  if (!observation) throw new Error("Unable to add price observation");
  return observation;
}

/**
 * Creates the first public price observation without introducing a separate
 * proposal table. The observation is valid immediately, while needsReview
 * gives editors a lightweight moderation queue.
 */
export async function addPublicPriceObservationData(input: {
  gearId: string;
  marketKey: string;
  createdById: string;
  currency: string;
  valueKind: "POINT" | "RANGE";
  amountMinor?: number | null;
  lowMinor?: number | null;
  highMinor?: number | null;
  observedAt: Date;
  evidenceUrl?: string | null;
  note?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [gearRow] = await tx
      .select({ id: gear.id, slug: gear.slug })
      .from(gear)
      .where(eq(gear.id, input.gearId))
      .limit(1);

    if (!gearRow) {
      throw Object.assign(new Error("Gear item not found"), { status: 404 });
    }

    const [existing] = await tx
      .select({ count: count() })
      .from(gearPriceObservations)
      .innerJoin(
        gearPriceMappings,
        eq(gearPriceMappings.id, gearPriceObservations.mappingId),
      )
      .where(
        and(
          eq(gearPriceMappings.gearId, input.gearId),
          eq(gearPriceMappings.status, "ACTIVE"),
          eq(gearPriceObservations.status, "VALID"),
        ),
      );

    if (Number(existing?.count ?? 0) > 0) {
      return {
        created: false as const,
        gearId: gearRow.id,
        gearSlug: gearRow.slug,
      };
    }

    const now = new Date();
    const [mapping] = await tx
      .insert(gearPriceMappings)
      .values({
        gearId: input.gearId,
        sourceKey: "manual",
        marketKey: input.marketKey,
        priceKind: "used_retail",
        createdById: input.createdById,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          gearPriceMappings.gearId,
          gearPriceMappings.sourceKey,
          gearPriceMappings.marketKey,
          gearPriceMappings.priceKind,
        ],
        set: {
          status: "ACTIVE",
          updatedAt: now,
        },
      })
      .returning({ id: gearPriceMappings.id });

    if (!mapping) throw new Error("Unable to create public price mapping");

    const [observation] = await tx
      .insert(gearPriceObservations)
      .values({
        mappingId: mapping.id,
        createdById: input.createdById,
        currency: input.currency,
        valueKind: input.valueKind,
        amountMinor: input.amountMinor ?? null,
        lowMinor: input.lowMinor ?? null,
        highMinor: input.highMinor ?? null,
        condition: "unknown",
        availability: "available",
        observedAt: input.observedAt,
        evidenceUrl: input.evidenceUrl ?? null,
        note: input.note ?? null,
        needsReview: true,
      })
      .returning();

    if (!observation) {
      throw new Error("Unable to add public price observation");
    }

    return {
      created: true as const,
      gearId: gearRow.id,
      gearSlug: gearRow.slug,
      observation,
    };
  });
}

export async function listRecentPriceObservationsData(limit = 30) {
  return db
    .select({
      id: gearPriceObservations.id,
      gearId: gear.id,
      gearName: gear.name,
      gearSlug: gear.slug,
      mappingId: gearPriceMappings.id,
      sourceKey: gearPriceMappings.sourceKey,
      marketKey: gearPriceMappings.marketKey,
      priceKind: gearPriceMappings.priceKind,
      valueKind: gearPriceObservations.valueKind,
      amountMinor: gearPriceObservations.amountMinor,
      lowMinor: gearPriceObservations.lowMinor,
      highMinor: gearPriceObservations.highMinor,
      currency: gearPriceObservations.currency,
      observedAt: gearPriceObservations.observedAt,
      fetchedAt: gearPriceObservations.fetchedAt,
      evidenceUrl: gearPriceObservations.evidenceUrl,
      note: gearPriceObservations.note,
      status: gearPriceObservations.status,
      needsReview: gearPriceObservations.needsReview,
      createdAt: gearPriceObservations.createdAt,
      createdById: gearPriceObservations.createdById,
      createdByName: users.name,
      createdByEmail: users.email,
    })
    .from(gearPriceObservations)
    .innerJoin(
      gearPriceMappings,
      eq(gearPriceMappings.id, gearPriceObservations.mappingId),
    )
    .innerJoin(gear, eq(gear.id, gearPriceMappings.gearId))
    .leftJoin(users, eq(users.id, gearPriceObservations.createdById))
    .orderBy(
      desc(gearPriceObservations.needsReview),
      desc(gearPriceObservations.createdAt),
    )
    .limit(limit);
}

export async function reviewPriceObservationData(input: {
  observationId: string;
  decision: "APPROVE" | "REJECT";
}) {
  return db.transaction(async (tx) => {
    const [context] = await tx
      .select({
        gearId: gear.id,
        gearSlug: gear.slug,
      })
      .from(gearPriceObservations)
      .innerJoin(
        gearPriceMappings,
        eq(gearPriceMappings.id, gearPriceObservations.mappingId),
      )
      .innerJoin(gear, eq(gear.id, gearPriceMappings.gearId))
      .where(eq(gearPriceObservations.id, input.observationId))
      .limit(1);

    if (!context) return null;

    const [observation] = await tx
      .update(gearPriceObservations)
      .set({
        needsReview: false,
        status: input.decision === "REJECT" ? "INVALID" : "VALID",
      })
      .where(eq(gearPriceObservations.id, input.observationId))
      .returning();

    if (!observation) return null;
    return { ...context, observation };
  });
}

export async function archiveOrDeletePriceMappingData(mappingId: string) {
  return db.transaction(async (tx) => {
    const [mapping] = await tx
      .select({
        id: gearPriceMappings.id,
        gearId: gearPriceMappings.gearId,
      })
      .from(gearPriceMappings)
      .where(eq(gearPriceMappings.id, mappingId))
      .limit(1);

    if (!mapping) return null;

    const [observationCount] = await tx
      .select({ count: count() })
      .from(gearPriceObservations)
      .where(eq(gearPriceObservations.mappingId, mappingId));
    const countValue = Number(observationCount?.count ?? 0);

    if (countValue === 0) {
      await tx
        .delete(gearPriceMappings)
        .where(eq(gearPriceMappings.id, mappingId));
      return {
        action: "deleted" as const,
        id: mapping.id,
        gearId: mapping.gearId,
        observationCount: countValue,
      };
    }

    const [archived] = await tx
      .update(gearPriceMappings)
      .set({ status: "DISABLED", updatedAt: new Date() })
      .where(eq(gearPriceMappings.id, mappingId))
      .returning();

    if (!archived) return null;
    return {
      action: "archived" as const,
      mapping: archived,
      observationCount: countValue,
    };
  });
}

export async function restorePriceMappingData(mappingId: string) {
  const [mapping] = await db
    .update(gearPriceMappings)
    .set({ status: "ACTIVE", updatedAt: new Date() })
    .where(
      and(
        eq(gearPriceMappings.id, mappingId),
        eq(gearPriceMappings.status, "DISABLED"),
      ),
    )
    .returning();
  return mapping ?? null;
}

export async function updatePriceMappingFetchData(input: {
  mappingId: string;
  fetchedAt: Date;
  nextFetchAt: Date;
  status: "SUCCESS" | "NO_DATA" | "ERROR";
  error?: string | null;
  observations: PriceAdapterObservation[];
  currency: string;
  createdById: string | null;
}) {
  return db.transaction(async (tx) => {
    if (input.observations.length > 0) {
      await tx.insert(gearPriceObservations).values(
        input.observations.map((observation) => ({
          mappingId: input.mappingId,
          createdById: input.createdById,
          currency: input.currency,
          valueKind: observation.valueKind,
          amountMinor: observation.amountMinor ?? null,
          lowMinor: observation.lowMinor ?? null,
          highMinor: observation.highMinor ?? null,
          condition: observation.condition ?? "unknown",
          availability: observation.availability ?? "available",
          observedAt: observation.observedAt,
          fetchedAt: input.fetchedAt,
          evidenceUrl: observation.evidenceUrl ?? null,
          note: observation.note ?? null,
          needsReview: false,
        })),
      );
    }

    const [mapping] = await tx
      .update(gearPriceMappings)
      .set({
        lastFetchedAt: input.fetchedAt,
        nextFetchAt: input.nextFetchAt,
        lastFetchStatus: input.status,
        lastFetchError: input.error ?? null,
        retryCount: input.status === "ERROR" ? 1 : 0,
        updatedAt: input.fetchedAt,
      })
      .where(eq(gearPriceMappings.id, input.mappingId))
      .returning();

    if (!mapping) throw new Error("Price mapping not found");
    return mapping;
  });
}

export async function persistGearPriceProjectionData(input: {
  gearId: string;
  projection: GearPriceProjection;
  estimates: PriceEstimateInsert[];
}) {
  return db.transaction(async (tx) => {
    if (input.estimates.length > 0) {
      await tx.insert(gearPriceEstimates).values(
        input.estimates.map((estimate) => ({
          ...estimate,
          gearId: input.gearId,
        })),
      );
    }

    const [updatedGear] = await tx
      .update(gear)
      .set({ usedPriceProjection: input.projection, updatedAt: new Date() })
      .where(eq(gear.id, input.gearId))
      .returning({ id: gear.id });

    if (!updatedGear) throw new Error("Gear item not found");
    return updatedGear;
  });
}

export async function listValidPriceObservationsForGearData(gearId: string) {
  return db
    .select({
      id: gearPriceObservations.id,
      mappingId: gearPriceObservations.mappingId,
      marketKey: gearPriceMappings.marketKey,
      priceKind: gearPriceMappings.priceKind,
      valueKind: gearPriceObservations.valueKind,
      amountMinor: gearPriceObservations.amountMinor,
      lowMinor: gearPriceObservations.lowMinor,
      highMinor: gearPriceObservations.highMinor,
      currency: gearPriceObservations.currency,
      observedAt: gearPriceObservations.observedAt,
      createdAt: gearPriceObservations.createdAt,
    })
    .from(gearPriceObservations)
    .innerJoin(
      gearPriceMappings,
      eq(gearPriceMappings.id, gearPriceObservations.mappingId),
    )
    .where(
      and(
        eq(gearPriceMappings.gearId, gearId),
        eq(gearPriceMappings.status, "ACTIVE"),
        eq(gearPriceObservations.status, "VALID"),
      ),
    )
    .orderBy(
      desc(gearPriceObservations.observedAt),
      desc(gearPriceObservations.createdAt),
      desc(gearPriceObservations.id),
    );
}

export async function listDuePriceMappingsData(limit: number) {
  return db
    .select({
      id: gearPriceMappings.id,
      gearId: gearPriceMappings.gearId,
      gearName: gear.name,
      gearSlug: gear.slug,
      sourceKey: gearPriceMappings.sourceKey,
      marketKey: gearPriceMappings.marketKey,
      canonicalUrl: gearPriceMappings.canonicalUrl,
      fetchUrl: gearPriceMappings.fetchUrl,
      externalProductId: gearPriceMappings.externalProductId,
    })
    .from(gearPriceMappings)
    .innerJoin(gear, eq(gear.id, gearPriceMappings.gearId))
    .where(
      and(
        eq(gearPriceMappings.status, "ACTIVE"),
        ne(gearPriceMappings.sourceKey, "manual"),
        or(
          isNull(gearPriceMappings.nextFetchAt),
          lte(gearPriceMappings.nextFetchAt, new Date()),
        ),
      ),
    )
    .orderBy(asc(gearPriceMappings.nextFetchAt))
    .limit(limit);
}

export async function createPriceFetchRunData() {
  const [run] = await db
    .insert(gearPriceFetchRuns)
    .values({ trigger: "CRON" })
    .returning();
  if (!run) throw new Error("Unable to create pricing fetch run");
  return run;
}

export async function recordPriceFetchRunItemData(input: {
  runId: string;
  mappingId: string;
  gearId: string;
  gearName: string;
  gearSlug: string;
  sourceKey: string;
  marketKey: string;
  status: "SUCCESS" | "NO_DATA" | "ERROR";
  insertedObservationCount: number;
  startedAt: Date;
  completedAt: Date;
  nextFetchAt?: Date | null;
  error?: string | null;
}) {
  const [item] = await db
    .insert(gearPriceFetchRunItems)
    .values({
      ...input,
      nextFetchAt: input.nextFetchAt ?? null,
      error: input.error ?? null,
    })
    .returning();
  if (!item) throw new Error("Unable to record pricing fetch result");
  return item;
}

export async function completePriceFetchRunData(input: {
  runId: string;
  status: "SUCCESS" | "PARTIAL" | "ERROR";
  scannedCount: number;
  successCount: number;
  noDataCount: number;
  errorCount: number;
  completedAt?: Date;
  error?: string | null;
}) {
  const [run] = await db
    .update(gearPriceFetchRuns)
    .set({
      status: input.status,
      scannedCount: input.scannedCount,
      successCount: input.successCount,
      noDataCount: input.noDataCount,
      errorCount: input.errorCount,
      completedAt: input.completedAt ?? new Date(),
      error: input.error ?? null,
    })
    .where(eq(gearPriceFetchRuns.id, input.runId))
    .returning();
  if (!run) throw new Error("Pricing fetch run not found");
  return run;
}

export async function listRecentPriceFetchRunsData(limit = 12) {
  const runs = await db
    .select()
    .from(gearPriceFetchRuns)
    .orderBy(desc(gearPriceFetchRuns.startedAt))
    .limit(limit);
  const runIds = runs.map((run) => run.id);
  const items = runIds.length
    ? await db
        .select()
        .from(gearPriceFetchRunItems)
        .where(inArray(gearPriceFetchRunItems.runId, runIds))
        .orderBy(desc(gearPriceFetchRunItems.startedAt))
    : [];
  const itemsByRun = new Map<string, typeof items>();
  for (const item of items) {
    const current = itemsByRun.get(item.runId) ?? [];
    current.push(item);
    itemsByRun.set(item.runId, current);
  }
  return runs.map((run) => ({
    ...run,
    items: itemsByRun.get(run.id) ?? [],
  }));
}

export async function listUpcomingPriceMappingsData(limit = 8) {
  const upcomingCutoff = getUpcomingFetchCutoff();

  return db
    .select({
      mappingId: gearPriceMappings.id,
      gearId: gear.id,
      gearName: gear.name,
      gearSlug: gear.slug,
      sourceKey: gearPriceMappings.sourceKey,
      marketKey: gearPriceMappings.marketKey,
      lastFetchStatus: gearPriceMappings.lastFetchStatus,
      lastFetchedAt: gearPriceMappings.lastFetchedAt,
      nextFetchAt: gearPriceMappings.nextFetchAt,
    })
    .from(gearPriceMappings)
    .innerJoin(gear, eq(gear.id, gearPriceMappings.gearId))
    .where(
      and(
        eq(gearPriceMappings.status, "ACTIVE"),
        ne(gearPriceMappings.sourceKey, "manual"),
        or(
          isNull(gearPriceMappings.nextFetchAt),
          lte(gearPriceMappings.nextFetchAt, upcomingCutoff),
        ),
      ),
    )
    .orderBy(asc(gearPriceMappings.nextFetchAt))
    .limit(limit);
}

export async function listPriceOverviewData(): Promise<PriceOverviewRow[]> {
  const [rows, counts] = await Promise.all([
    db
      .select({
        mappingId: gearPriceMappings.id,
        gearId: gear.id,
        gearName: gear.name,
        gearSlug: gear.slug,
        sourceKey: gearPriceMappings.sourceKey,
        marketKey: gearPriceMappings.marketKey,
        priceKind: gearPriceMappings.priceKind,
        status: gearPriceMappings.status,
        lastFetchStatus: gearPriceMappings.lastFetchStatus,
        lastFetchedAt: gearPriceMappings.lastFetchedAt,
        nextFetchAt: gearPriceMappings.nextFetchAt,
      })
      .from(gearPriceMappings)
      .innerJoin(gear, eq(gear.id, gearPriceMappings.gearId))
      .where(ne(gearPriceMappings.sourceKey, "manual"))
      .orderBy(desc(gearPriceMappings.updatedAt)),
    db
      .select({ mappingId: gearPriceObservations.mappingId, count: count() })
      .from(gearPriceObservations)
      .groupBy(gearPriceObservations.mappingId),
  ]);
  const countByMapping = new Map(
    counts.map((row) => [row.mappingId, Number(row.count)]),
  );
  return rows.map((row) => ({
    ...row,
    observationCount: countByMapping.get(row.mappingId) ?? 0,
  }));
}

export type PriceMappingRow = Awaited<ReturnType<typeof getPriceMappingData>>;
export type PriceManagementResult = Awaited<
  ReturnType<typeof getPriceManagementData>
>;
export type PriceFetchMapping = PriceAdapterMapping;
export type PriceFetchResultData = PriceFetchResult;
