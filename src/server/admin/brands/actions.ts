"use server";
import "server-only";

import { revalidatePath } from "next/cache";
import { createBrandService, updateBrandSortOrdersService } from "./service";

export async function actionCreateBrand(
  input: Parameters<typeof createBrandService>[0],
) {
  const result = await createBrandService(input);
  revalidatePath("/admin/tools");
  return result;
}

export async function actionUpdateBrandSortOrders(
  params: Parameters<typeof updateBrandSortOrdersService>[0],
) {
  const result = await updateBrandSortOrdersService(params);
  revalidatePath("/admin/tools");
  return result;
}
