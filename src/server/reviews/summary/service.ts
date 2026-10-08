// In Next.js runtime, enforce server-only import. In scripts (Node), skip.
if (process.env.NEXT_RUNTIME) {
  import("server-only").catch(() => {
    console.warn("[ai-summary:service] server-only import failed, skipping.");
  });
}

import { openai } from "~/lib/open-ai/open-ai";
import {
  countApprovedReviewsForGear,
  fetchRecentApprovedReviews,
  getReviewSummaryRow,
  isSummaryOlderThanDays,
  upsertReviewSummary,
} from "./data";
import {
  SUMMARY_MODEL,
  SUMMARY_SYSTEM_MESSAGE,
  SUMMARY_TEMPERATURE,
  buildSummaryPrompt,
} from "./prompt-config";

export const SUMMARY_CONFIG = {
  minReviews: 5, //TODO: increase to 10
  sampleSize: 40,
  maxCharsPerReview: 600,
  cooldownDays: 7,
} as const;

export { buildSummaryPrompt as buildPrompt };

export async function maybeGenerateReviewSummary(params: {
  gearId: string;
  gearName: string; // avoid an extra DB join for a minimal system
}): Promise<{ generated: boolean } | { generated: false; reason: string }> {
  console.log("[ai-summary] maybeGenerateReviewSummary:start", {
    gearId: params.gearId,
    gearName: params.gearName,
  });
  if (!openai) {
    console.log("[ai-summary] missing OPENAI_API_KEY");
    return { generated: false, reason: "missing_openai_key" } as const;
  }

  const { gearId, gearName } = params;
  const approvedCount = await countApprovedReviewsForGear(gearId);
  console.log("[ai-summary] approved reviews count", { gearId, approvedCount });
  if (approvedCount < SUMMARY_CONFIG.minReviews) {
    console.log("[ai-summary] skip: not enough reviews", {
      min: SUMMARY_CONFIG.minReviews,
    });
    return { generated: false, reason: "not_enough_reviews" } as const;
  }

  const existing = await getReviewSummaryRow(gearId);
  if (!existing) {
    // proceed
  } else {
    const stale = await isSummaryOlderThanDays(
      gearId,
      SUMMARY_CONFIG.cooldownDays,
    );
    console.log("[ai-summary] existing summary status", {
      hasExisting: true,
      updatedAt: existing.updatedAt,
      stale,
      cooldownDays: SUMMARY_CONFIG.cooldownDays,
    });
    if (!stale) {
      console.log("[ai-summary] skip: cooldown active");
      return { generated: false, reason: "cooldown_active" } as const;
    }
  }

  const sample = await fetchRecentApprovedReviews(
    gearId,
    SUMMARY_CONFIG.sampleSize,
  );
  console.log("[ai-summary] sample fetched", {
    sampleSize: sample.length,
    configuredLimit: SUMMARY_CONFIG.sampleSize,
  });
  if (sample.length === 0)
    return { generated: false, reason: "no_sample" } as const;

  const prompt = buildSummaryPrompt({
    gearName,
    previousSummary: existing?.summaryText ?? null,
    reviews: sample,
    maxCharsPerReview: SUMMARY_CONFIG.maxCharsPerReview,
  });
  console.log("[ai-summary] invoking model", {
    model: SUMMARY_MODEL,
    promptChars: prompt.length,
  });

  const resp = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    messages: [
      {
        role: "system",
        content: SUMMARY_SYSTEM_MESSAGE,
      },
      { role: "user", content: prompt },
    ],
    temperature: SUMMARY_TEMPERATURE,
  });

  const text = resp.choices?.[0]?.message?.content?.trim?.();
  if (!text) {
    console.log("[ai-summary] empty response from model");
    return { generated: false, reason: "empty_response" } as const;
  }
  console.log("[ai-summary] model response", { chars: text.length });

  await upsertReviewSummary({ gearId, summaryText: text });
  console.log("[ai-summary] upserted summary", { gearId });
  return { generated: true } as const;
}

export async function fetchReviewSummary(gearId: string) {
  // console.log("[ai-summary] fetchReviewSummary", { gearId });
  if (!openai) return null;
  const row = await getReviewSummaryRow(gearId);
  return row?.summaryText ?? null;
}

export async function generateReviewSummaryFromProvidedReviews(params: {
  gearId: string;
  gearName: string;
  reviews: {
    content: string;
    recommend: boolean | null;
    genres: string[] | null;
  }[];
  previousSummary?: string | null;
}): Promise<string> {
  console.log("[ai-summary] generateFromProvidedReviews:start", {
    gearId: params.gearId,
    gearName: params.gearName,
    sampleSize: params.reviews.length,
  });
  if (!openai) throw new Error("OPENAI_API_KEY missing");
  const prompt = buildSummaryPrompt({
    gearName: params.gearName,
    previousSummary: params.previousSummary ?? null,
    reviews: params.reviews,
    maxCharsPerReview: SUMMARY_CONFIG.maxCharsPerReview,
  });
  console.log("[ai-summary] invoking model", {
    model: SUMMARY_MODEL,
    promptChars: prompt.length,
  });
  const resp = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    messages: [
      {
        role: "system",
        content: SUMMARY_SYSTEM_MESSAGE,
      },
      { role: "user", content: prompt },
    ],
    temperature: SUMMARY_TEMPERATURE,
  });
  const text = resp.choices?.[0]?.message?.content?.trim?.();
  if (!text) throw new Error("Empty response from model");
  await upsertReviewSummary({ gearId: params.gearId, summaryText: text });
  console.log("[ai-summary] upserted summary (provided reviews)", {
    gearId: params.gearId,
    chars: text.length,
  });
  return text;
}
