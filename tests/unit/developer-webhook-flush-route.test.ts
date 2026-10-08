import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cronSecret: undefined as string | undefined,
  dispatchDueDeveloperWebhookDeliveries: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: {
    get CRON_SECRET() {
      return mocks.cronSecret;
    },
  },
}));
vi.mock("~/server/developer-api/webhooks/service", () => ({
  dispatchDueDeveloperWebhookDeliveries:
    mocks.dispatchDueDeveloperWebhookDeliveries,
}));

import { GET, POST } from "~/app/api/admin/developer-webhooks/flush/route";

describe("developer webhook flush route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cronSecret = "cron-secret";
    mocks.dispatchDueDeveloperWebhookDeliveries.mockResolvedValue({
      claimed: 1,
      delivered: 1,
      retrying: 0,
      canceled: 0,
    });
  });

  it("rejects requests when the cron secret is unset, including Bearer undefined", async () => {
    mocks.cronSecret = undefined;
    const response = await GET(
      new Request(
        "https://sharply.example/api/admin/developer-webhooks/flush",
        {
          headers: { authorization: "Bearer undefined" },
        },
      ) as never,
    );

    expect(response.status).toBe(401);
    expect(mocks.dispatchDueDeveloperWebhookDeliveries).not.toHaveBeenCalled();
  });

  it("dispatches through authenticated GET and POST requests", async () => {
    for (const handler of [GET, POST]) {
      const response = await handler(
        new Request(
          "https://sharply.example/api/admin/developer-webhooks/flush",
          {
            headers: { authorization: "Bearer cron-secret" },
          },
        ) as never,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: true });
    }

    expect(mocks.dispatchDueDeveloperWebhookDeliveries).toHaveBeenCalledTimes(
      2,
    );
  });
});
