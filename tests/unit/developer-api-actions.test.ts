import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeveloperApiError } from "~/server/developer-api/errors";

const mocks = vi.hoisted(() => ({
  createDeveloperApiKey: vi.fn(),
  createDeveloperWebhookTarget: vi.fn(),
  sendDeveloperWebhookTestEvent: vi.fn(),
  deleteDeveloperWebhookTarget: vi.fn(),
  setDeveloperWebhookTargetEnabled: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("~/server/developer-api/service", () => ({
  createDeveloperApiKey: mocks.createDeveloperApiKey,
  createDeveloperApiKeyForAdmin: vi.fn(),
  revokeDeveloperApiKey: vi.fn(),
  revokeDeveloperApiKeyForAdmin: vi.fn(),
  setDeveloperAccessForUser: vi.fn(),
}));
vi.mock("~/server/developer-api/webhooks/service", () => ({
  createDeveloperWebhookTarget: mocks.createDeveloperWebhookTarget,
  sendDeveloperWebhookTestEvent: mocks.sendDeveloperWebhookTestEvent,
  deleteDeveloperWebhookTarget: mocks.deleteDeveloperWebhookTarget,
  setDeveloperWebhookTargetEnabled: mocks.setDeveloperWebhookTargetEnabled,
}));

import {
  actionCreateDeveloperApiKey,
  actionCreateDeveloperWebhookTarget,
  actionDeleteDeveloperWebhookTarget,
  actionSetDeveloperWebhookTargetEnabled,
  actionSendDeveloperWebhookTestEvent,
} from "~/server/developer-api/actions";

describe("developer API actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves expected DeveloperApiError details", async () => {
    mocks.createDeveloperApiKey.mockRejectedValue(
      new DeveloperApiError(
        "key_limit_reached",
        409,
        "You can have up to three active API keys.",
      ),
    );

    const formData = new FormData();
    formData.set("name", "Production");

    await expect(actionCreateDeveloperApiKey(formData)).resolves.toEqual({
      ok: false,
      code: "key_limit_reached",
      message: "You can have up to three active API keys.",
    });
  });

  it("returns a safe failure for unexpected errors", async () => {
    mocks.createDeveloperApiKey.mockRejectedValue(new Error("Database down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(actionCreateDeveloperApiKey(new FormData())).resolves.toEqual({
      ok: false,
      code: undefined,
      message: undefined,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Developer API action failed:",
      expect.any(Error),
    );
  });

  it("creates webhook targets from the endpoint and event form fields", async () => {
    mocks.createDeveloperWebhookTarget.mockResolvedValue({
      target: { id: "target-1" },
      secret: "whsec_once",
    });
    const formData = new FormData();
    formData.set("endpointUrl", "https://hooks.example.com/events");
    formData.set("eventType", "gear.created");

    await expect(actionCreateDeveloperWebhookTarget(formData)).resolves.toEqual(
      {
        ok: true,
        target: { id: "target-1" },
        secret: "whsec_once",
      },
    );
    expect(mocks.createDeveloperWebhookTarget).toHaveBeenCalledWith({
      endpointUrl: "https://hooks.example.com/events",
      eventType: "gear.created",
    });
  });

  it("delegates webhook pause and delete mutations to the service", async () => {
    mocks.setDeveloperWebhookTargetEnabled.mockResolvedValue(undefined);
    mocks.deleteDeveloperWebhookTarget.mockResolvedValue(undefined);

    await expect(
      actionSetDeveloperWebhookTargetEnabled("target-1", false),
    ).resolves.toEqual({ ok: true });
    await expect(
      actionDeleteDeveloperWebhookTarget("target-1"),
    ).resolves.toEqual({
      ok: true,
    });

    expect(mocks.setDeveloperWebhookTargetEnabled).toHaveBeenCalledWith({
      targetId: "target-1",
      enabled: false,
    });
    expect(mocks.deleteDeveloperWebhookTarget).toHaveBeenCalledWith("target-1");
  });

  it("returns the test event delivery status", async () => {
    mocks.sendDeveloperWebhookTestEvent.mockResolvedValue({
      succeeded: false,
      statusCode: 503,
    });

    await expect(
      actionSendDeveloperWebhookTestEvent("target-1"),
    ).resolves.toEqual({ ok: true, succeeded: false, statusCode: 503 });
    expect(mocks.sendDeveloperWebhookTestEvent).toHaveBeenCalledWith(
      "target-1",
    );
  });
});
