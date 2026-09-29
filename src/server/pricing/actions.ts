"use server";
import "server-only";

import { revalidateLocalizedPaths } from "~/server/revalidation";
import {
  addManualPriceObservationService,
  archiveOrDeletePriceMappingService,
  createPriceMappingService,
  recalculateGearPricingService,
  refreshPriceMappingService,
  restorePriceMappingService,
  updatePriceMappingLinkService,
} from "./service";

function revalidatePricingPaths(slug: string) {
  revalidateLocalizedPaths([`/gear/${slug}`, "/admin/prices"]);
}

export async function actionCreatePriceMapping(
  input: Parameters<typeof createPriceMappingService>[0],
) {
  const mapping = await createPriceMappingService(input);
  return mapping;
}

export async function actionUpdatePriceMappingLink(
  mappingId: string,
  slug: string,
  url: string | null,
) {
  const mapping = await updatePriceMappingLinkService({ mappingId, url });
  revalidatePricingPaths(slug);
  return mapping;
}

export async function actionAddManualPriceObservation(
  input: Parameters<typeof addManualPriceObservationService>[0],
) {
  const result = await addManualPriceObservationService(input);
  revalidatePricingPaths(result.gear.slug);
  return result;
}

export async function actionRefreshPriceMapping(
  mappingId: string,
  slug: string,
) {
  const result = await refreshPriceMappingService(mappingId);
  if (result.ok) revalidatePricingPaths(slug);
  return result;
}

export async function actionRecalculateGearPricing(
  gearId: string,
  slug: string,
) {
  const result = await recalculateGearPricingService(gearId);
  revalidatePricingPaths(slug);
  return result;
}

export async function actionArchiveOrDeletePriceMapping(
  mappingId: string,
  slug: string,
) {
  const result = await archiveOrDeletePriceMappingService(mappingId);
  revalidatePricingPaths(slug);
  return result;
}

export async function actionRestorePriceMapping(
  mappingId: string,
  slug: string,
) {
  const result = await restorePriceMappingService(mappingId);
  revalidatePricingPaths(slug);
  return result;
}
