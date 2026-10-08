import "server-only";

import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";
import { evaluateForEvent } from "~/server/badges/service";
import { invalidateDeveloperApiCatalogCache } from "~/server/developer-api/cache";
import { createNotification } from "~/server/notifications/service";
import type { GearEditProposal } from "~/types/gear";
import {
  approveProposalData,
  countRecentResolvedProposals,
  fetchPendingProposalsData,
  fetchRecentResolvedProposalsData,
  getProposalData,
  mergeProposalData,
  rejectProposalData,
} from "./data";

type EnrichedProposal = GearEditProposal & {
  gearName: string;
  gearSlug: string;
  createdByName: string | null;
  createdByImage: string | null;
  beforeCore?: Record<string, unknown>;
  beforeCamera?: Record<string, unknown>;
  beforeLens?: Record<string, unknown>;
};

type ProposalGroup = {
  gearId: string;
  gearName: string;
  gearSlug: string;
  proposals: EnrichedProposal[];
};

type ProposalGroups = {
  pending: ProposalGroup[];
  resolvedRecent: ProposalGroup[];
  resolvedRecentCount: number;
};

const CATALOG_CORE_FIELDS = new Set([
  "name",
  "slug",
  "brandId",
  "gearType",
  "thumbnailUrl",
  "releaseDate",
  "releaseDatePrecision",
  "announcedDate",
  "announceDatePrecision",
  "discontinuedDate",
  "discontinuedDatePrecision",
  "publicationState",
]);

function proposalAffectsDeveloperCatalog(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const core = (payload as { core?: unknown }).core;
  if (!core || typeof core !== "object" || Array.isArray(core)) return false;
  return Object.keys(core).some((key) => CATALOG_CORE_FIELDS.has(key));
}

function groupProposals(proposals: EnrichedProposal[]): ProposalGroup[] {
  const groupedProposals = proposals.reduce<ProposalGroup[]>(
    (acc, proposal) => {
      const existingGroup = acc.find(
        (group) => group.gearId === proposal.gearId,
      );

      if (existingGroup) {
        existingGroup.proposals.push(proposal);
      } else {
        acc.push({
          gearId: proposal.gearId,
          gearName: proposal.gearName,
          gearSlug: proposal.gearSlug,
          proposals: [proposal],
        });
      }

      return acc;
    },
    [],
  );

  groupedProposals.sort((a, b) => {
    const aLatest = Math.max(
      ...a.proposals.map((p) => new Date(p.createdAt as any).getTime()),
    );
    const bLatest = Math.max(
      ...b.proposals.map((p) => new Date(p.createdAt as any).getTime()),
    );
    return bLatest - aLatest;
  });

  return groupedProposals;
}

export async function fetchGearProposals(): Promise<ProposalGroups> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [pending, resolvedRecent, resolvedRecentCount] = await Promise.all([
    fetchPendingProposalsData(),
    fetchRecentResolvedProposalsData(since),
    countRecentResolvedProposals(since),
  ]);

  return {
    pending: groupProposals(pending as EnrichedProposal[]),
    resolvedRecent: groupProposals(resolvedRecent as EnrichedProposal[]),
    resolvedRecentCount,
  };
}

export async function fetchRecentResolvedProposals(
  days: number,
  limit?: number,
): Promise<ProposalGroup[]> {
  const { user } = await getSessionOrThrow();
  if (!requireRole(user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const resolved = await fetchRecentResolvedProposalsData(since, limit);
  return groupProposals(resolved as EnrichedProposal[]);
}

export async function fetchPendingProposalGroups(): Promise<ProposalGroup[]> {
  const { user } = await getSessionOrThrow();
  if (!requireRole(user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  const pending = await fetchPendingProposalsData();
  return groupProposals(pending as EnrichedProposal[]);
}

export async function fetchResolvedProposalGroupsWithCount(
  days: number,
  limit?: number,
) {
  const { user } = await getSessionOrThrow();
  if (!requireRole(user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [resolved, count] = await Promise.all([
    fetchRecentResolvedProposalsData(since, limit),
    countRecentResolvedProposals(since),
  ]);
  return {
    groups: groupProposals(resolved as EnrichedProposal[]),
    count,
    days,
  };
}

async function notifyContributorOfApprovedGearEdit(params: {
  gearId: string;
  proposalId: string;
  createdById: string | null;
  gearContext: { gearName: string; gearSlug: string };
}) {
  if (!params.createdById) return;

  await evaluateForEvent(
    { type: "edit.approved", context: { gearId: params.gearId } },
    params.createdById,
  );

  await createNotification({
    userId: params.createdById,
    type: "gear_spec_approved",
    title: "Your spec edit was approved!",
    body: `${params.gearContext.gearName ?? "Gear"} is now updated. Click to view the page.`,
    linkUrl: `/gear/${params.gearContext.gearSlug}`,
    sourceType: "gear",
    sourceId: params.gearId,
    metadata: {
      proposalId: params.proposalId,
      gearName: params.gearContext.gearName ?? null,
      gearSlug: params.gearContext.gearSlug,
    },
  });
}

/**
 * Applies a pending proposal for the contributor who created it, without staff role.
 * Only intended for trusted add-only auto-approval from `submitGearEditProposal`
 * after eligibility checks; enforces that the session user owns the proposal.
 */
export async function applyTrustedContributorProposalApproval(
  proposalId: string,
  filteredPayload: unknown = undefined,
  gearContext: { gearName: string; gearSlug: string },
) {
  const { user } = await getSessionOrThrow();
  const proposal = (await getProposalData(proposalId)) as
    | (EnrichedProposal & { payload: unknown })
    | null;
  if (!proposal) {
    throw new Error("Proposal not found");
  }

  if (proposal.status !== "PENDING") {
    throw new Error("Proposal is not pending");
  }

  if (proposal.createdById !== user.id) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const createdWebhookEvent = await approveProposalData(
    proposalId,
    proposal.gearId,
    proposal.payload,
    user.id,
    filteredPayload,
  );

  if (createdWebhookEvent) {
    const { scheduleDeveloperWebhookDispatch } =
      await import("~/server/developer-api/webhooks/service");
    scheduleDeveloperWebhookDispatch();
  }

  if (proposalAffectsDeveloperCatalog(filteredPayload ?? proposal.payload)) {
    invalidateDeveloperApiCatalogCache();
  }

  await notifyContributorOfApprovedGearEdit({
    gearId: proposal.gearId,
    proposalId: proposal.id,
    createdById: proposal.createdById,
    gearContext,
  });
}

export async function approveProposal(
  id: string,
  filteredPayload: unknown = undefined,
  gearContext: { gearName: string; gearSlug: string },
) {
  const { user } = await getSessionOrThrow();
  if (!requireRole(user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const proposal = (await getProposalData(id)) as
    | (EnrichedProposal & { payload: unknown })
    | null;
  if (!proposal) {
    throw new Error("Proposal not found");
  }

  if (proposal.status !== "PENDING") {
    throw new Error("Proposal is not pending");
  }

  const createdWebhookEvent = await approveProposalData(
    id,
    proposal.gearId,
    proposal.payload,
    user.id,
    filteredPayload,
  );

  if (createdWebhookEvent) {
    const { scheduleDeveloperWebhookDispatch } =
      await import("~/server/developer-api/webhooks/service");
    scheduleDeveloperWebhookDispatch();
  }

  if (proposalAffectsDeveloperCatalog(filteredPayload ?? proposal.payload)) {
    invalidateDeveloperApiCatalogCache();
  }

  await notifyContributorOfApprovedGearEdit({
    gearId: proposal.gearId,
    proposalId: proposal.id,
    createdById: proposal.createdById,
    gearContext,
  });
}

export async function mergeProposal(id: string) {
  const { user } = await getSessionOrThrow();
  if (!requireRole(user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const proposal = (await getProposalData(id)) as EnrichedProposal | null;
  if (!proposal) {
    throw new Error("Proposal not found");
  }

  if (proposal.status !== "PENDING") {
    throw new Error("Proposal is not pending");
  }

  await mergeProposalData(id, proposal.gearId, user.id);
}

export async function rejectProposal(id: string) {
  const { user } = await getSessionOrThrow();
  if (!requireRole(user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const proposal = (await getProposalData(id)) as EnrichedProposal | null;
  if (!proposal) {
    throw new Error("Proposal not found");
  }

  if (proposal.status !== "PENDING") {
    throw new Error("Proposal is not pending");
  }

  await rejectProposalData(id, proposal.gearId, user.id);
}
