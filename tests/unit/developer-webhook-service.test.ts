import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeveloperApiError } from "~/server/developer-api/errors";

const mocks = vi.hoisted(() => ({
  requireDeveloperPortalUser: vi.fn(),
  listDeveloperWebhookTargetsData: vi.fn(),
  createDeveloperWebhookTargetData: vi.fn(),
  setDeveloperWebhookTargetEnabledData: vi.fn(),
  deleteDeveloperWebhookTargetData: vi.fn(),
  claimDueDeveloperWebhookDeliveries: vi.fn(),
  completeDeveloperWebhookDelivery: vi.fn(),
  cancelDeveloperWebhookDeliveryData: vi.fn(),
  createWebhookSigningSecret: vi.fn(),
  decryptWebhookSigningSecret: vi.fn(),
  encryptWebhookSigningSecret: vi.fn(),
  postSignedWebhook: vi.fn(),
  resolvePublicWebhookEndpoint: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("~/server/developer-api/service", () => ({
  requireDeveloperPortalUser: mocks.requireDeveloperPortalUser,
}));
vi.mock("~/server/developer-api/webhooks/data", () => ({
  cancelDeveloperWebhookDeliveryData: mocks.cancelDeveloperWebhookDeliveryData,
  claimDueDeveloperWebhookDeliveries: mocks.claimDueDeveloperWebhookDeliveries,
  completeDeveloperWebhookDelivery: mocks.completeDeveloperWebhookDelivery,
  createDeveloperWebhookTargetData: mocks.createDeveloperWebhookTargetData,
  deleteDeveloperWebhookTargetData: mocks.deleteDeveloperWebhookTargetData,
  listDeveloperWebhookTargetsData: mocks.listDeveloperWebhookTargetsData,
  setDeveloperWebhookTargetEnabledData:
    mocks.setDeveloperWebhookTargetEnabledData,
}));
vi.mock("~/server/developer-api/webhooks/security", () => ({
  createWebhookSigningSecret: mocks.createWebhookSigningSecret,
  decryptWebhookSigningSecret: mocks.decryptWebhookSigningSecret,
  encryptWebhookSigningSecret: mocks.encryptWebhookSigningSecret,
  postSignedWebhook: mocks.postSignedWebhook,
  resolvePublicWebhookEndpoint: mocks.resolvePublicWebhookEndpoint,
}));

import {
  createDeveloperWebhookTarget,
  deleteDeveloperWebhookTarget,
  dispatchDueDeveloperWebhookDeliveries,
  setDeveloperWebhookTargetEnabled,
} from "~/server/developer-api/webhooks/service";

describe("developer webhook service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDeveloperPortalUser.mockResolvedValue({ id: "user-1" });
    mocks.resolvePublicWebhookEndpoint.mockImplementation(
      async (endpoint: string) => ({
        url: new URL(endpoint),
        address: { address: "93.184.216.34", family: 4 },
      }),
    );
    mocks.createWebhookSigningSecret.mockReturnValue("whsec_once");
    mocks.encryptWebhookSigningSecret.mockReturnValue("ciphertext");
  });

  it("creates only the supported event type for the signed-in owner", async () => {
    const target = {
      id: "target-1",
      eventType: "gear.created",
      endpointUrl: "https://hooks.example.com/gear",
      isEnabled: true,
      createdAt: new Date("2026-10-08T00:00:00.000Z"),
    };
    mocks.createDeveloperWebhookTargetData.mockResolvedValue({
      status: "created",
      target,
    });

    await expect(
      createDeveloperWebhookTarget({
        endpointUrl: "https://hooks.example.com/gear",
        eventType: "gear.created",
      }),
    ).resolves.toEqual({ target, secret: "whsec_once" });
    expect(mocks.createDeveloperWebhookTargetData).toHaveBeenCalledWith({
      userId: "user-1",
      eventType: "gear.created",
      endpointUrl: "https://hooks.example.com/gear",
      signingSecretCiphertext: "ciphertext",
      maxTargets: 3,
    });
  });

  it("rejects unsupported event types before saving a target", async () => {
    await expect(
      createDeveloperWebhookTarget({
        endpointUrl: "https://hooks.example.com",
        eventType: "gear.deleted",
      }),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    expect(mocks.createDeveloperWebhookTargetData).not.toHaveBeenCalled();
  });

  it("reports the atomic three-target cap", async () => {
    mocks.createDeveloperWebhookTargetData.mockResolvedValue({
      status: "limit_reached",
    });

    await expect(
      createDeveloperWebhookTarget({
        endpointUrl: "https://hooks.example.com",
        eventType: "gear.created",
      }),
    ).rejects.toMatchObject({ code: "target_limit_reached", status: 409 });
  });

  it("keeps pause and delete operations scoped to the owner", async () => {
    mocks.setDeveloperWebhookTargetEnabledData.mockResolvedValue(true);
    mocks.deleteDeveloperWebhookTargetData.mockResolvedValue(true);

    await setDeveloperWebhookTargetEnabled({
      targetId: "target-1",
      enabled: false,
    });
    await deleteDeveloperWebhookTarget("target-1");

    expect(mocks.setDeveloperWebhookTargetEnabledData).toHaveBeenCalledWith({
      targetId: "target-1",
      enabled: false,
      userId: "user-1",
    });
    expect(mocks.deleteDeveloperWebhookTargetData).toHaveBeenCalledWith({
      targetId: "target-1",
      userId: "user-1",
    });
  });

  it("does not create a target when developer access is unavailable", async () => {
    mocks.requireDeveloperPortalUser.mockRejectedValue(
      new DeveloperApiError(
        "developer_access_required",
        403,
        "Access required",
      ),
    );

    await expect(
      createDeveloperWebhookTarget({
        endpointUrl: "https://hooks.example.com",
        eventType: "gear.created",
      }),
    ).rejects.toMatchObject({ code: "developer_access_required" });
    expect(mocks.createDeveloperWebhookTargetData).not.toHaveBeenCalled();
  });

  it("records a non-2xx send as retryable with two retries after the first attempt", async () => {
    const now = new Date("2026-10-08T15:04:05.000Z");
    mocks.claimDueDeveloperWebhookDeliveries.mockResolvedValue([
      {
        id: "delivery-1",
        attemptCount: 1,
        targetId: "target-1",
        userId: "user-1",
        userAccessEnabled: true,
        targetEnabled: true,
        endpointUrl: "https://hooks.example.com",
        signingSecretCiphertext: "ciphertext",
        payload: { id: "event-1", type: "gear.created" },
      },
    ]);
    mocks.decryptWebhookSigningSecret.mockReturnValue("whsec_secret");
    mocks.postSignedWebhook.mockResolvedValue({
      succeeded: false,
      statusCode: 503,
    });

    await expect(dispatchDueDeveloperWebhookDeliveries(now)).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      retrying: 1,
      canceled: 0,
    });
    expect(mocks.completeDeveloperWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "delivery-1",
        attemptCount: 1,
        succeeded: false,
        statusCode: 503,
        maxAttempts: 3,
        retryIntervalMs: 5 * 60_000,
      }),
    );
  });

  it("cancels claimed work when access was removed or the target was paused", async () => {
    mocks.claimDueDeveloperWebhookDeliveries.mockResolvedValue([
      {
        id: "delivery-1",
        attemptCount: 2,
        targetId: "target-1",
        userId: "user-1",
        userAccessEnabled: false,
        targetEnabled: true,
        endpointUrl: "https://hooks.example.com",
        signingSecretCiphertext: "ciphertext",
        payload: { id: "event-1" },
      },
    ]);

    await expect(
      dispatchDueDeveloperWebhookDeliveries(),
    ).resolves.toMatchObject({
      canceled: 1,
      retrying: 0,
    });
    expect(mocks.cancelDeveloperWebhookDeliveryData).toHaveBeenCalledWith(
      "delivery-1",
    );
    expect(mocks.postSignedWebhook).not.toHaveBeenCalled();
  });
});
