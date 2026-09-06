"use server";
import "server-only";

import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";
import { revalidateGearPages } from "~/server/revalidation";

export async function actionRevalidateGearPage(params: { gearSlug: string }) {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const gearSlug = params.gearSlug.trim();
  if (!gearSlug) {
    throw Object.assign(new Error("Missing gear slug"), { status: 400 });
  }

  const path = `/gear/${gearSlug}`;
  revalidateGearPages([gearSlug]);

  return { ok: true as const, path };
}
