/**
 * E2E-only DB fixtures for the Playwright read sweep. Runs AFTER db:seed in
 * the e2e pipeline (CI + setup-local). Never run against dev/prod databases.
 * Values are consumed by tests/playwright/utils/route-manifest.ts — keep in sync.
 */
import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import {
  gearTags,
  invites,
  recommendationCharts,
  recommendationItems,
  sharedLists,
  tags,
  userListItems,
  userLists,
  users,
} from "../../src/server/db/schema";
import { assertLocalDatabase } from "./assert-local-e2e-db";

const Z6III_ID = "ec11113e-ae24-44cb-871f-4eb763d2d378"; // scripts/seed.ts liveZ6iii

async function ensureDevUser() {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, "dev@sharply.local"))
    .limit(1);
  if (existing[0]) {
    const [updated] = await db
      .update(users)
      .set({
        role: "SUPERADMIN",
        handle: "sharply-dev",
        name: "Sharply Dev User",
        developerAccessEnabled: true,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return updated ?? existing[0];
  }
  const [created] = await db
    .insert(users)
    .values({
      name: "Sharply Dev User",
      email: "dev@sharply.local",
      role: "SUPERADMIN",
      handle: "sharply-dev",
      developerAccessEnabled: true,
    })
    .returning();
  return created!;
}

async function ensureTag() {
  const [tag] = await db
    .insert(tags)
    .values({
      name: "E2E Seed Collection",
      slug: "e2e-seed-collection",
      description: "Deterministic tag for the e2e read sweep.",
    })
    .onConflictDoNothing({ target: tags.slug })
    .returning();
  const record =
    tag ??
    (
      await db
        .select()
        .from(tags)
        .where(eq(tags.slug, "e2e-seed-collection"))
        .limit(1)
    )[0]!;
  await db
    .insert(gearTags)
    .values({ gearId: Z6III_ID, tagId: record.id })
    .onConflictDoNothing();
}

async function ensureSharedList(userId: string) {
  const existing = await db
    .select()
    .from(sharedLists)
    .where(eq(sharedLists.publicId, "e2eseedpub1"))
    .limit(1);
  if (existing[0]) return;
  // Transaction: without it, a crash between the userLists insert and the
  // sharedLists insert leaves an orphaned list with no visible fixture row —
  // the existence check above (on sharedLists.publicId) would never see it
  // and would keep retrying the whole chain. Atomicity makes that impossible:
  // either every row lands, or none does and the next run starts clean.
  await db.transaction(async (tx) => {
    const [list] = await tx
      .insert(userLists)
      .values({ userId, name: "E2E Shared List" })
      .returning();
    await tx
      .insert(userListItems)
      .values({ listId: list!.id, gearId: Z6III_ID });
    await tx.insert(sharedLists).values({
      listId: list!.id,
      slug: "e2e-shared-list",
      publicId: "e2eseedpub1",
      isPublished: true,
    });
  });
}

async function ensureInvite(createdById: string) {
  await db
    .insert(invites)
    .values({
      id: "e2e-invite-fixture-0001",
      inviteeName: "E2E Invitee",
      createdById,
    })
    .onConflictDoNothing({ target: invites.id });
}

async function ensureRecommendationChart() {
  // recommendation_charts' unique index is composite (brand, slug) — a
  // slug-only lookup could match a different brand's chart of the same slug
  // and skip creating this one.
  const existingChart = await db
    .select()
    .from(recommendationCharts)
    .where(
      and(
        eq(recommendationCharts.brand, "nikon"),
        eq(recommendationCharts.slug, "e2e-seed-chart"),
      ),
    )
    .limit(1);
  const chartId =
    existingChart[0]?.id ??
    (
      await db
        .insert(recommendationCharts)
        .values({
          brand: "nikon",
          slug: "e2e-seed-chart",
          title: "E2E Seed Nikon Chart",
          updatedDate: "2026-08-31",
          isPublished: true,
        })
        .returning()
    )[0]!.id;

  // Re-check the child row explicitly instead of returning early once the
  // chart exists: an early return keyed only on the parent (as this used to
  // do) can never notice a chart whose item is missing — whether from a
  // crash between the two inserts, a manual deletion, or any other cause —
  // and would then report "fixtures ensured" forever while under-seeded.
  const existingItem = await db
    .select()
    .from(recommendationItems)
    .where(eq(recommendationItems.chartId, chartId))
    .limit(1);
  if (existingItem[0]) return;
  await db.insert(recommendationItems).values({
    chartId,
    gearId: Z6III_ID,
    rating: "balanced", // recommendationRatingEnum, schema.ts:336
  });
}

async function main() {
  assertLocalDatabase("e2e:seed-fixtures");
  const devUser = await ensureDevUser();
  await ensureTag();
  await ensureSharedList(devUser.id);
  await ensureInvite(devUser.id);
  await ensureRecommendationChart();
  console.log("[e2e:seed-fixtures] fixtures ensured");
  process.exit(0);
}

main().catch((error) => {
  console.error("[e2e:seed-fixtures] failed", error);
  process.exit(1);
});
