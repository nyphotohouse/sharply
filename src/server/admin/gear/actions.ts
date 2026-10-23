"use server";
import "server-only";

import { revalidatePath } from "next/cache";
import { type GearRegion } from "~/lib/gear/region";
import {
  isGearImageReviewRejectedError,
  reviewRejectionResult,
} from "~/lib/gear/image-review-result";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import {
  revalidateGearPages,
  revalidateHomePage,
} from "~/server/revalidation";
import {
  clearGearLeftViewService,
  clearGearRearViewService,
  clearGearRightViewService,
  clearGearThumbnailService,
  clearGearTopViewService,
  applyLensOpticsBackfillService,
  createGearAdmin,
  deleteGearService,
  renameGearService,
  setGearLeftViewService,
  setGearOgImageService,
  setGearRearViewService,
  setGearRightViewService,
  setGearThumbnailService,
  setGearTopViewService,
  updateGearPublicationStateService,
  updateGearAliasesService,
  type GearCreationParams,
} from "./service";

export async function actionCreateGear(params: GearCreationParams) {
  const result = await createGearAdmin(params);
  revalidatePath("/admin");
  revalidateGearPages([result.slug], { includeBrowse: true });
  // New published gear appears in Home's activity list and gear counter.
  if (
    (params.publicationState ?? GEAR_PUBLICATION_STATES.PUBLISHED) ===
    GEAR_PUBLICATION_STATES.PUBLISHED
  ) {
    revalidateHomePage();
  }
  return result;
}

export async function actionRenameGear(params: {
  gearId: string;
  newName: string;
}) {
  const result = await renameGearService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.previousSlug, result.slug], {
    includeBrowse: true,
  });
  return result;
}

export async function actionUpdateGearAliases(params: {
  gearId: string;
  gearSlug?: string;
  aliases: { region: GearRegion; name: string | null }[];
}) {
  const { ...rest } = params;
  const result = await updateGearAliasesService(rest);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug ?? params.gearSlug ?? ""], {
    includeBrowse: true,
  });
  return result;
}

export async function actionSetGearThumbnail(params: {
  gearId?: string;
  slug?: string;
  thumbnailUrl: string;
  ogImageUrl?: string | null;
}) {
  let result;
  try {
    result = await setGearThumbnailService(params);
  } catch (error) {
    if (isGearImageReviewRejectedError(error))
      return reviewRejectionResult(error);
    throw error;
  }
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionSetGearOgImage(params: {
  gearId?: string;
  slug?: string;
  ogImageUrl: string | null;
}) {
  const result = await setGearOgImageService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug]);
  return result;
}

export async function actionClearGearThumbnail(params: {
  gearId?: string;
  slug?: string;
}) {
  const result = await clearGearThumbnailService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionSetGearTopView(params: {
  gearId?: string;
  slug?: string;
  topViewUrl: string;
}) {
  let result;
  try {
    result = await setGearTopViewService(params);
  } catch (error) {
    if (isGearImageReviewRejectedError(error))
      return reviewRejectionResult(error);
    throw error;
  }
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionClearGearTopView(params: {
  gearId?: string;
  slug?: string;
}) {
  const result = await clearGearTopViewService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionSetGearRearView(params: {
  gearId?: string;
  slug?: string;
  rearViewUrl: string;
}) {
  let result;
  try {
    result = await setGearRearViewService(params);
  } catch (error) {
    if (isGearImageReviewRejectedError(error))
      return reviewRejectionResult(error);
    throw error;
  }
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionClearGearRearView(params: {
  gearId?: string;
  slug?: string;
}) {
  const result = await clearGearRearViewService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionSetGearLeftView(params: {
  gearId?: string;
  slug?: string;
  leftViewUrl: string;
}) {
  let result;
  try {
    result = await setGearLeftViewService(params);
  } catch (error) {
    if (isGearImageReviewRejectedError(error))
      return reviewRejectionResult(error);
    throw error;
  }
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionClearGearLeftView(params: {
  gearId?: string;
  slug?: string;
}) {
  const result = await clearGearLeftViewService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionSetGearRightView(params: {
  gearId?: string;
  slug?: string;
  rightViewUrl: string;
}) {
  let result;
  try {
    result = await setGearRightViewService(params);
  } catch (error) {
    if (isGearImageReviewRejectedError(error))
      return reviewRejectionResult(error);
    throw error;
  }
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionClearGearRightView(params: {
  gearId?: string;
  slug?: string;
}) {
  const result = await clearGearRightViewService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionDeleteGear(gearId: string) {
  const result = await deleteGearService(gearId);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  return result;
}

export async function actionUpdateGearPublicationState(params: {
  gearId: string;
  publicationState: "PUBLISHED" | "RUMORED" | "HIDDEN";
}) {
  const result = await updateGearPublicationStateService(params);
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  revalidatePath("/lists/under-construction");
  // Home's activity list and gear counter only include published gear. A bare
  // revalidatePath("/") misses the localized "/en" ISR entry.
  revalidateHomePage();
  return result;
}

export async function actionApplyLensOpticsBackfill(params: {
  gearId: string;
}) {
  const result = await applyLensOpticsBackfillService(params);
  revalidatePath("/admin/tools");
  revalidatePath("/admin/gear");
  revalidateGearPages([result.slug], { includeBrowse: true });
  revalidatePath("/lists/under-construction");
  return result;
}
