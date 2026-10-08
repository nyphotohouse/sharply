"use server";

import { revalidatePath } from "next/cache";
import { DeveloperApiError } from "./errors";
import {
  createDeveloperApiKey,
  createDeveloperApiKeyForAdmin,
  revokeDeveloperApiKey,
  revokeDeveloperApiKeyForAdmin,
  setDeveloperAccessForUser,
} from "./service";
import {
  createDeveloperWebhookTarget,
  deleteDeveloperWebhookTarget,
  sendDeveloperWebhookTestEvent,
  setDeveloperWebhookTargetEnabled,
} from "./webhooks/service";

function actionError(error: unknown) {
  if (error instanceof DeveloperApiError) {
    return { ok: false as const, code: error.code, message: error.message };
  }
  console.error("Developer API action failed:", error);
  return {
    ok: false as const,
    code: undefined,
    message: undefined,
  };
}

export async function actionCreateDeveloperApiKey(formData: FormData) {
  try {
    const result = await createDeveloperApiKey({ name: formData.get("name") });
    revalidatePath("/developer");
    return { ok: true as const, secret: result.secret };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionRevokeDeveloperApiKey(keyId: string) {
  try {
    await revokeDeveloperApiKey(keyId);
    revalidatePath("/developer");
    return { ok: true as const };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionCreateDeveloperWebhookTarget(formData: FormData) {
  try {
    const result = await createDeveloperWebhookTarget({
      endpointUrl: formData.get("endpointUrl"),
      eventType: formData.get("eventType"),
    });
    revalidatePath("/developer");
    return { ok: true as const, ...result };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionSetDeveloperWebhookTargetEnabled(
  targetId: string,
  enabled: boolean,
) {
  try {
    await setDeveloperWebhookTargetEnabled({ targetId, enabled });
    revalidatePath("/developer");
    return { ok: true as const };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionDeleteDeveloperWebhookTarget(targetId: string) {
  try {
    await deleteDeveloperWebhookTarget(targetId);
    revalidatePath("/developer");
    return { ok: true as const };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionSendDeveloperWebhookTestEvent(targetId: string) {
  try {
    return {
      ok: true as const,
      ...(await sendDeveloperWebhookTestEvent(targetId)),
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionSetDeveloperAccess(
  userId: string,
  enabled: boolean,
) {
  try {
    await setDeveloperAccessForUser(userId, enabled);
    revalidatePath("/admin/developer-api");
    return { ok: true as const };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionCreateDeveloperApiKeyForAdmin(formData: FormData) {
  try {
    const userId = formData.get("userId");
    if (typeof userId !== "string") throw new Error("Missing user id.");
    const result = await createDeveloperApiKeyForAdmin({
      userId,
      name: formData.get("name"),
    });
    revalidatePath("/admin/developer-api");
    return { ok: true as const, secret: result.secret };
  } catch (error) {
    return actionError(error);
  }
}

export async function actionRevokeDeveloperApiKeyForAdmin(keyId: string) {
  try {
    await revokeDeveloperApiKeyForAdmin(keyId);
    revalidatePath("/admin/developer-api");
    return { ok: true as const };
  } catch (error) {
    return actionError(error);
  }
}
