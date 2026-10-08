import "server-only";

import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { normalizeViewfinderEyePointUpdate } from "~/lib/specs/viewfinder";
import type { VideoModeNormalized } from "~/lib/video/mode-schema";
import { db } from "~/server/db";
import { getResolvedUserImageSql } from "~/server/users/data";
import { normalizeProposalPayloadForDb } from "~/server/db/normalizers";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { enqueueGearCreatedWebhookEvent } from "~/server/developer-api/webhooks/data";
import {
  analogCameraSpecs,
  auditLogs,
  cameraAfAreaSpecs,
  cameraCardSlots,
  cameraSpecs,
  cameraVideoModes,
  fixedLensSpecs,
  gear,
  gearEdits,
  gearMounts,
  lensSpecs,
  users,
} from "~/server/db/schema";
import type { GearEditProposal } from "~/types/gear";

type ProposalSelect = {
  id: string;
  gearId: string;
  gearName: string;
  gearSlug: string;
  createdById: string;
  createdByName: string | null;
  createdByImage: string | null;
  status: GearEditProposal["status"];
  payload: GearEditProposal["payload"];
  metadata: GearEditProposal["metadata"];
  note: string | null;
  createdAt: Date;
};

type Baseline = {
  core: Record<string, unknown>;
  analogCamera: Record<string, unknown>;
  camera: Record<string, unknown>;
  lens: Record<string, unknown>;
  fixedLens: Record<string, unknown>;
};

type EnrichedProposal = ProposalSelect & {
  beforeCore?: Record<string, unknown>;
  beforeAnalogCamera?: Record<string, unknown>;
  beforeCamera?: Record<string, unknown>;
  beforeLens?: Record<string, unknown>;
  beforeFixedLens?: Record<string, unknown>;
};

function pickSubset(
  src: Record<string, unknown>,
  keys?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!keys) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(keys)) out[k] = src?.[k] ?? null;
  return Object.keys(out).length > 0 ? out : undefined;
}

async function fetchEnrichedProposals(
  whereClause?: unknown,
): Promise<EnrichedProposal[]> {
  // Fetch gear edits with related data, filtered as needed
  const query = db
    .select({
      id: gearEdits.id,
      gearId: gearEdits.gearId,
      gearName: gear.name,
      gearSlug: gear.slug,
      createdById: gearEdits.createdById,
      createdByName: users.name,
      createdByImage: getResolvedUserImageSql(),
      status: gearEdits.status,
      payload: gearEdits.payload,
      metadata: gearEdits.metadata,
      note: gearEdits.note,
      createdAt: gearEdits.createdAt,
    })
    .from(gearEdits)
    .innerJoin(gear, eq(gearEdits.gearId, gear.id))
    .innerJoin(users, eq(gearEdits.createdById, users.id));

  if (whereClause) {
    query.where(whereClause as any);
  }

  const proposals: ProposalSelect[] = await query.orderBy(
    desc(gearEdits.createdAt),
  );

  // Build a baseline cache per gear to compute "before" values
  const baselineCache = new Map<string, Baseline>();
  const getBaseline = async (gearId: string): Promise<Baseline> => {
    const cached = baselineCache.get(gearId);
    if (cached) return cached;
    const [g] = await db
      .select()
      .from(gear)
      .where(eq(gear.id, gearId))
      .limit(1);
    const [cam] = await db
      .select()
      .from(cameraSpecs)
      .where(eq(cameraSpecs.gearId, gearId))
      .limit(1);
    const [analogCam] = await db
      .select()
      .from(analogCameraSpecs)
      .where(eq(analogCameraSpecs.gearId, gearId))
      .limit(1);
    const [lens] = await db
      .select()
      .from(lensSpecs)
      .where(eq(lensSpecs.gearId, gearId))
      .limit(1);
    const [fixedLens] = await db
      .select()
      .from(fixedLensSpecs)
      .where(eq(fixedLensSpecs.gearId, gearId))
      .limit(1);
    const baseline: Baseline = {
      core: (g ?? {}) as Record<string, unknown>,
      analogCamera: (analogCam ?? {}) as Record<string, unknown>,
      camera: (cam ?? {}) as Record<string, unknown>,
      lens: (lens ?? {}) as Record<string, unknown>,
      fixedLens: (fixedLens ?? {}) as Record<string, unknown>,
    };
    baselineCache.set(gearId, baseline);
    return baseline;
  };

  // Attach before values for only the keys present in payload
  const enriched: EnrichedProposal[] = await Promise.all(
    proposals.map(async (p): Promise<EnrichedProposal> => {
      const base = await getBaseline(p.gearId);
      const payload = (p.payload ?? {}) as Record<string, unknown> & {
        core?: Record<string, unknown>;
        analogCamera?: Record<string, unknown>;
        camera?: Record<string, unknown>;
        lens?: Record<string, unknown>;
        fixedLens?: Record<string, unknown>;
        cameraCardSlots?: unknown;
      };
      return {
        ...p,
        beforeCore: pickSubset(base.core, payload.core),
        beforeAnalogCamera: pickSubset(base.analogCamera, payload.analogCamera),
        beforeCamera: pickSubset(base.camera, payload.camera),
        beforeLens: pickSubset(base.lens, payload.lens),
        beforeFixedLens: pickSubset(base.fixedLens, payload.fixedLens),
      };
    }),
  );

  return enriched;
}

export async function fetchPendingProposalsData(): Promise<EnrichedProposal[]> {
  return fetchEnrichedProposals(eq(gearEdits.status, "PENDING"));
}

export async function fetchRecentResolvedProposalsData(
  since: Date,
  limit?: number,
): Promise<EnrichedProposal[]> {
  const whereClause = and(
    ne(gearEdits.status, "PENDING"),
    gte(gearEdits.updatedAt, since),
  );
  if (!limit || limit <= 0) {
    return fetchEnrichedProposals(whereClause);
  }
  const proposals = await db
    .select({
      id: gearEdits.id,
      gearId: gearEdits.gearId,
      gearName: gear.name,
      gearSlug: gear.slug,
      createdById: gearEdits.createdById,
      createdByName: users.name,
      createdByImage: getResolvedUserImageSql(),
      status: gearEdits.status,
      payload: gearEdits.payload,
      metadata: gearEdits.metadata,
      note: gearEdits.note,
      createdAt: gearEdits.createdAt,
    })
    .from(gearEdits)
    .innerJoin(gear, eq(gearEdits.gearId, gear.id))
    .innerJoin(users, eq(gearEdits.createdById, users.id))
    .where(whereClause)
    .orderBy(desc(gearEdits.updatedAt))
    .limit(limit);

  // Build a baseline cache per gear to compute "before" values
  const baselineCache = new Map<string, Baseline>();
  const getBaseline = async (gearId: string): Promise<Baseline> => {
    const cached = baselineCache.get(gearId);
    if (cached) return cached;
    const [g] = await db
      .select()
      .from(gear)
      .where(eq(gear.id, gearId))
      .limit(1);
    const [cam] = await db
      .select()
      .from(cameraSpecs)
      .where(eq(cameraSpecs.gearId, gearId))
      .limit(1);
    const [analogCam] = await db
      .select()
      .from(analogCameraSpecs)
      .where(eq(analogCameraSpecs.gearId, gearId))
      .limit(1);
    const [lens] = await db
      .select()
      .from(lensSpecs)
      .where(eq(lensSpecs.gearId, gearId))
      .limit(1);
    const [fixedLens] = await db
      .select()
      .from(fixedLensSpecs)
      .where(eq(fixedLensSpecs.gearId, gearId))
      .limit(1);
    const baseline: Baseline = {
      core: (g ?? {}) as Record<string, unknown>,
      analogCamera: (analogCam ?? {}) as Record<string, unknown>,
      camera: (cam ?? {}) as Record<string, unknown>,
      lens: (lens ?? {}) as Record<string, unknown>,
      fixedLens: (fixedLens ?? {}) as Record<string, unknown>,
    };
    baselineCache.set(gearId, baseline);
    return baseline;
  };

  const enriched: EnrichedProposal[] = await Promise.all(
    proposals.map(async (p): Promise<EnrichedProposal> => {
      const base = await getBaseline(p.gearId);
      const payload = (p.payload ?? {}) as Record<string, unknown> & {
        core?: Record<string, unknown>;
        analogCamera?: Record<string, unknown>;
        camera?: Record<string, unknown>;
        lens?: Record<string, unknown>;
        fixedLens?: Record<string, unknown>;
        cameraCardSlots?: unknown;
      };
      return {
        ...p,
        beforeCore: pickSubset(base.core, payload.core),
        beforeAnalogCamera: pickSubset(base.analogCamera, payload.analogCamera),
        beforeCamera: pickSubset(base.camera, payload.camera),
        beforeLens: pickSubset(base.lens, payload.lens),
        beforeFixedLens: pickSubset(base.fixedLens, payload.fixedLens),
      };
    }),
  );

  return enriched;
}

export async function countRecentResolvedProposals(since: Date) {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(gearEdits)
    .where(
      and(ne(gearEdits.status, "PENDING"), gte(gearEdits.updatedAt, since)),
    );
  return rows[0]?.count ?? 0;
}

export async function getProposalData(
  id: string,
): Promise<GearEditProposal | null> {
  const rows: GearEditProposal[] = await db
    .select()
    .from(gearEdits)
    .where(eq(gearEdits.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export async function updateProposalStatusData(
  id: string,
  status: "APPROVED" | "REJECTED" | "MERGED",
) {
  await db.update(gearEdits).set({ status }).where(eq(gearEdits.id, id));
}

export async function approveProposalData(
  proposalId: string,
  gearId: string,
  payload: any,
  userId: string,
  filteredPayload?: any,
) {
  return db.transaction(async (tx) => {
    let createdEvent = false;
    // Determine final payload (filtered if provided) and normalize to DB types
    const source = filteredPayload ?? payload;
    const normalized = normalizeProposalPayloadForDb(source);
    const normalizedPayload =
      normalized && typeof normalized === "object"
        ? (normalized as {
            core?: any;
            analogCamera?: any;
            camera?: any;
            lens?: any;
            fixedLens?: any;
          })
        : null;

    if (normalizedPayload?.camera || normalizedPayload?.analogCamera) {
      const [currentCamera, currentAnalogCamera] = await Promise.all([
        normalizedPayload.camera
          ? tx
              .select({
                viewfinderType: cameraSpecs.viewfinderType,
                viewfinderEyePointMm: cameraSpecs.viewfinderEyePointMm,
              })
              .from(cameraSpecs)
              .where(eq(cameraSpecs.gearId, gearId))
              .limit(1)
              .then(([row]) => row)
          : Promise.resolve(undefined),
        normalizedPayload.analogCamera
          ? tx
              .select({
                viewfinderType: analogCameraSpecs.viewfinderType,
                viewfinderEyePointMm: analogCameraSpecs.viewfinderEyePointMm,
              })
              .from(analogCameraSpecs)
              .where(eq(analogCameraSpecs.gearId, gearId))
              .limit(1)
              .then(([row]) => row)
          : Promise.resolve(undefined),
      ]);

      if (normalizedPayload.camera) {
        normalizedPayload.camera = normalizeViewfinderEyePointUpdate(
          currentCamera,
          normalizedPayload.camera,
        );
      }
      if (normalizedPayload.analogCamera) {
        normalizedPayload.analogCamera = normalizeViewfinderEyePointUpdate(
          currentAnalogCamera,
          normalizedPayload.analogCamera,
        );
      }
    }

    // Update the proposal status to APPROVED and persist only the applied changes
    await tx
      .update(gearEdits)
      .set({
        status: "APPROVED",
        payload: normalized || {},
        updatedAt: new Date(),
      })
      .where(eq(gearEdits.id, proposalId));

    // Audit: approved
    await tx.insert(auditLogs).values({
      action: "GEAR_EDIT_APPROVE",
      actorUserId: userId,
      gearId: gearId,
      gearEditId: proposalId,
    });

    // Apply the changes to the gear
    if (normalizedPayload) {
      if (normalizedPayload.core) {
        // Map legacy keys to current column names and avoid empty UPDATE SET
        const coreUpdate: Record<string, unknown> = {
          ...normalizedPayload.core,
        };
        if (Object.prototype.hasOwnProperty.call(coreUpdate, "msrpUsdCents")) {
          coreUpdate.msrpNowUsdCents = coreUpdate.msrpUsdCents;
          delete (coreUpdate as any).msrpUsdCents;
        }

        // Handle mountIds array (many-to-many junction table)
        if (Array.isArray(coreUpdate.mountIds)) {
          const mountIds = coreUpdate.mountIds as string[];
          // Delete existing mount mappings
          await tx.delete(gearMounts).where(eq(gearMounts.gearId, gearId));
          // Insert new mappings
          if (mountIds.length > 0) {
            const rows = mountIds.map((mountId: string) => ({
              gearId,
              mountId,
            }));
            await tx.insert(gearMounts).values(rows);
          }
          // Also update gear.mountId to first mount for backward compatibility
          if (mountIds.length > 0) {
            coreUpdate.mountId = mountIds[0];
          } else {
            coreUpdate.mountId = null;
          }
          delete (coreUpdate as any).mountIds; // Don't try to update gear.mountIds (doesn't exist)
        } else if (coreUpdate.mountIds === null) {
          await tx.delete(gearMounts).where(eq(gearMounts.gearId, gearId));
          coreUpdate.mountId = null;
          delete (coreUpdate as any).mountIds;
        }

        if (Object.keys(coreUpdate).length > 0) {
          const publicationTarget =
            coreUpdate.publicationState === GEAR_PUBLICATION_STATES.PUBLISHED
              ? await tx
                  .select({
                    id: gear.id,
                    name: gear.name,
                    slug: gear.slug,
                    gearType: gear.gearType,
                    publicationState: gear.publicationState,
                  })
                  .from(gear)
                  .where(eq(gear.id, gearId))
                  .limit(1)
              : [];
          await tx.update(gear).set(coreUpdate).where(eq(gear.id, gearId));
          if (
            publicationTarget[0] &&
            publicationTarget[0].publicationState !==
              GEAR_PUBLICATION_STATES.PUBLISHED
          ) {
            createdEvent = Boolean(
              await enqueueGearCreatedWebhookEvent(tx, {
                gearId: publicationTarget[0].id,
                name: publicationTarget[0].name,
                slug: publicationTarget[0].slug,
                gearType: publicationTarget[0].gearType,
                publicBaseUrl: getPublicBaseUrl(),
              }),
            );
          }
        }
      }

      // Apply camera specs if they exist
      if (normalizedPayload.camera) {
        // Split pivot-field (afAreaModes) from actual cameraSpecs columns
        const { afAreaModes: afAreaModeIds, ...cameraUpdate } =
          normalizedPayload.camera ?? {};

        // Only issue UPDATE if we actually have column updates
        if (Object.keys(cameraUpdate).length > 0) {
          await tx
            .update(cameraSpecs)
            .set(cameraUpdate)
            .where(eq(cameraSpecs.gearId, gearId));
        }

        // Handle pivot updates for AF area modes if provided
        if (Array.isArray(afAreaModeIds)) {
          // Replace existing links with the provided set
          await tx
            .delete(cameraAfAreaSpecs)
            .where(eq(cameraAfAreaSpecs.gearId, gearId));

          if (afAreaModeIds.length > 0) {
            const rows = afAreaModeIds.map((id: string) => ({
              gearId,
              afAreaModeId: id,
            }));
            await tx.insert(cameraAfAreaSpecs).values(rows);
          }
        }
      }

      // Apply analog camera specs (upsert)
      if (normalizedPayload.analogCamera) {
        const analogUpdate = { ...normalizedPayload.analogCamera } as Record<
          string,
          unknown
        >;
        if (Object.keys(analogUpdate).length > 0) {
          await tx
            .insert(analogCameraSpecs)
            .values({ gearId, ...(analogUpdate as any) })
            .onConflictDoUpdate({
              target: analogCameraSpecs.gearId,
              set: analogUpdate as any,
            });
        }
      }

      // Apply lens specs if they exist
      if (normalizedPayload.lens) {
        // Avoid empty UPDATE SET
        const lensUpdate = { ...normalizedPayload.lens } as Record<
          string,
          unknown
        >;
        if (Object.keys(lensUpdate).length > 0) {
          await tx
            .update(lensSpecs)
            .set(lensUpdate)
            .where(eq(lensSpecs.gearId, gearId));
        }
      }

      // Apply fixed-lens specs if provided (upsert by gearId)
      if (normalizedPayload.fixedLens) {
        const fixedUpdate = { ...normalizedPayload.fixedLens } as Record<
          string,
          unknown
        >;
        if (Object.keys(fixedUpdate).length > 0) {
          await tx
            .insert(fixedLensSpecs)
            .values({ gearId, ...(fixedUpdate as any) })
            .onConflictDoUpdate({
              target: fixedLensSpecs.gearId,
              set: fixedUpdate as any,
            });
        }
      }

      // Apply camera card slots (replace set) if provided
      if (Array.isArray((normalized as any).cameraCardSlots)) {
        const slots = (normalized as any).cameraCardSlots as Array<{
          slotIndex: number;
          supportedFormFactors: string[];
          supportedBuses: string[];
          supportedSpeedClasses?: string[];
        }>;

        // Replace existing slots for this gear
        await tx
          .delete(cameraCardSlots)
          .where(eq(cameraCardSlots.gearId, gearId as any));

        if (slots.length > 0) {
          const rows = slots.map((s) => ({
            gearId: gearId as any,
            slotIndex: s.slotIndex,
            supportedFormFactors: s.supportedFormFactors,
            supportedBuses: s.supportedBuses,
            supportedSpeedClasses: s.supportedSpeedClasses ?? [],
          }));
          await tx.insert(cameraCardSlots).values(rows as any);
        }
      }

      if (Array.isArray((normalized as any).videoModes)) {
        const modes = (normalized as any).videoModes as VideoModeNormalized[];
        await tx
          .delete(cameraVideoModes)
          .where(eq(cameraVideoModes.gearId, gearId));
        if (modes.length > 0) {
          await tx.insert(cameraVideoModes).values(
            modes.map((mode) => ({
              gearId,
              resolutionKey: mode.resolutionKey,
              resolutionLabel: mode.resolutionLabel,
              resolutionHorizontal: mode.resolutionHorizontal,
              resolutionVertical: mode.resolutionVertical,
              fps: mode.fps,
              codecLabel: mode.codecLabel,
              bitDepth: mode.bitDepth,
              cropFactor: mode.cropFactor,
              notes: mode.notes ?? null,
            })) as any,
          );
        }
      }
    }

    await tx
      .update(gear)
      .set({ updatedAt: new Date() })
      .where(eq(gear.id, gearId));

    // Set all other pending proposals for the same gear to MERGED
    await tx
      .update(gearEdits)
      .set({ status: "MERGED", updatedAt: new Date() })
      .where(
        and(
          eq(gearEdits.gearId, gearId),
          eq(gearEdits.status, "PENDING"),
          ne(gearEdits.id, proposalId),
        ),
      );

    // Audit: merged others (self-noted)
    await tx.insert(auditLogs).values({
      action: "GEAR_EDIT_MERGE",
      actorUserId: userId,
      gearId: gearId,
      gearEditId: proposalId,
    });

    return createdEvent;
  });
}

function getPublicBaseUrl() {
  const value = process.env.NEXT_PUBLIC_BASE_URL;
  if (!value)
    throw new Error("NEXT_PUBLIC_BASE_URL is required for webhook URLs.");
  return value;
}

export async function mergeProposalData(
  proposalId: string,
  gearId: string,
  userId: string,
) {
  await db
    .update(gearEdits)
    .set({ status: "MERGED", updatedAt: new Date() })
    .where(eq(gearEdits.id, proposalId));

  // Audit: merged
  try {
    await db.insert(auditLogs).values({
      action: "GEAR_EDIT_MERGE",
      actorUserId: userId,
      gearEditId: proposalId,
      gearId: gearId,
    });
  } catch (e) {
    console.warn("[merge] audit log failed", e);
  }
}

export async function rejectProposalData(
  proposalId: string,
  gearId: string,
  userId: string,
) {
  await db
    .update(gearEdits)
    .set({ status: "REJECTED", updatedAt: new Date() })
    .where(eq(gearEdits.id, proposalId));

  // Audit: rejected
  try {
    await db.insert(auditLogs).values({
      action: "GEAR_EDIT_REJECT",
      actorUserId: userId,
      gearId: gearId,
      gearEditId: proposalId,
    });
  } catch (e) {
    console.warn("[reject] audit log failed", e);
  }
}
