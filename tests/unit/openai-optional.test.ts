import { afterEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  countApprovedReviewsForGear: vi.fn(),
  fetchRecentApprovedReviews: vi.fn(),
  getReviewSummaryRow: vi.fn(),
  isSummaryOlderThanDays: vi.fn(),
  upsertReviewSummary: vi.fn(),
}));
vi.mock("~/server/reviews/summary/data", () => data);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("optional OpenAI configuration", () => {
  it.each([undefined, "", "   "])(
    "disables summaries with key %j",
    async (key) => {
      vi.stubEnv("OPENAI_API_KEY", key);
      const { openai } = await import("~/lib/open-ai/open-ai");
      expect(openai).toBeNull();
      const service = await import("~/server/reviews/summary/service");
      await expect(
        service.maybeGenerateReviewSummary({
          gearId: "gear",
          gearName: "Camera",
        }),
      ).resolves.toEqual({ generated: false, reason: "missing_openai_key" });
      await expect(service.fetchReviewSummary("gear")).resolves.toBeNull();
      await expect(
        service.generateReviewSummaryFromProvidedReviews({
          gearId: "gear",
          gearName: "Camera",
          reviews: [],
        }),
      ).rejects.toThrow("OPENAI_API_KEY missing");
      for (const mock of Object.values(data))
        expect(mock).not.toHaveBeenCalled();
    },
  );

  it("enables summary reads and generation with a configured key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const { openai } = await import("~/lib/open-ai/open-ai");
    expect(openai).not.toBeNull();
    vi.spyOn(openai!.chat.completions, "create").mockResolvedValue({
      choices: [{ message: { content: "Summary" } }],
    } as never);
    data.getReviewSummaryRow.mockResolvedValue({
      summaryText: "Stored summary",
    });
    const service = await import("~/server/reviews/summary/service");
    await expect(service.fetchReviewSummary("gear")).resolves.toBe(
      "Stored summary",
    );
    await expect(
      service.generateReviewSummaryFromProvidedReviews({
        gearId: "gear",
        gearName: "Camera",
        reviews: [],
      }),
    ).resolves.toBe("Summary");
    expect(data.upsertReviewSummary).toHaveBeenCalledWith({
      gearId: "gear",
      summaryText: "Summary",
    });
  });

  it.each([undefined, ""])(
    "accepts production env without an OpenAI key (%j)",
    async (key) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SKIP_ENV_VALIDATION", "");
      vi.stubEnv("OPENAI_API_KEY", key);
      for (const name of [
        "AUTH_SECRET",
        "AUTH_DISCORD_ID",
        "AUTH_DISCORD_SECRET",
        "AUTH_GOOGLE_ID",
        "AUTH_GOOGLE_SECRET",
        "CRON_SECRET",
        "PAYLOAD_SECRET",
        "UPLOADTHING_TOKEN",
      ]) {
        vi.stubEnv(name, "test-value");
      }
      vi.stubEnv("DATABASE_URL", "postgres://localhost/sharply");
      vi.stubEnv("DISCORD_ROLLUP_WEBHOOK_URL", "https://example.com/webhook");
      vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://example.com");
      const { env } = await import("~/env.js");
      expect(env.OPENAI_API_KEY).toBeUndefined();
    },
  );
});
