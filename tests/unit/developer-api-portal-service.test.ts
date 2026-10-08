import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  requireRole: vi.fn(),
  fetchGearBySlug: vi.fn(),
  getSuggestions: vi.fn(),
  searchGear: vi.fn(),
  consumeRateLimitBucket: vi.fn(),
  countActiveApiKeysForUser: vi.fn(),
  createApiKeyData: vi.fn(),
  createApiKeyWithinActiveLimitData: vi.fn(),
  findUsableApiKeyByHash: vi.fn(),
  getDeveloperAccessData: vi.fn(),
  getUsageForKeyIdsSince: vi.fn(),
  incrementUsageData: vi.fn(),
  listApiKeysForUser: vi.fn(),
  listAllApiKeysData: vi.fn(),
  listDeveloperUsersData: vi.fn(),
  listDeveloperWebhookTargetsForAdminData: vi.fn(),
  listDeveloperWebhookDeliveriesForAdminData: vi.fn(),
  revokeAllApiKeysForUser: vi.fn(),
  revokeApiKeyData: vi.fn(),
  setDeveloperAccessData: vi.fn(),
  touchApiKeyLastUsed: vi.fn(),
  listDeveloperWebhookTargetsData: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/lib/auth/auth-helpers", () => ({ requireRole: mocks.requireRole }));
vi.mock("~/server/auth", () => ({
  getSessionOrThrow: mocks.getSessionOrThrow,
}));
vi.mock("~/server/gear/service", () => ({
  fetchGearBySlug: mocks.fetchGearBySlug,
}));
vi.mock("~/server/search/service", () => ({
  getSuggestions: mocks.getSuggestions,
  searchGear: mocks.searchGear,
}));
vi.mock("~/server/developer-api/data", () => ({
  consumeRateLimitBucket: mocks.consumeRateLimitBucket,
  countActiveApiKeysForUser: mocks.countActiveApiKeysForUser,
  createApiKeyData: mocks.createApiKeyData,
  createApiKeyWithinActiveLimitData: mocks.createApiKeyWithinActiveLimitData,
  findUsableApiKeyByHash: mocks.findUsableApiKeyByHash,
  getDeveloperAccessData: mocks.getDeveloperAccessData,
  getUsageForKeyIdsSince: mocks.getUsageForKeyIdsSince,
  incrementUsageData: mocks.incrementUsageData,
  listApiKeysForUser: mocks.listApiKeysForUser,
  listAllApiKeysData: mocks.listAllApiKeysData,
  listDeveloperUsersData: mocks.listDeveloperUsersData,
  revokeAllApiKeysForUser: mocks.revokeAllApiKeysForUser,
  revokeApiKeyData: mocks.revokeApiKeyData,
  setDeveloperAccessData: mocks.setDeveloperAccessData,
  touchApiKeyLastUsed: mocks.touchApiKeyLastUsed,
}));
vi.mock("~/server/developer-api/webhooks/data", () => ({
  listDeveloperWebhookDeliveriesForAdminData:
    mocks.listDeveloperWebhookDeliveriesForAdminData,
  listDeveloperWebhookTargetsData: mocks.listDeveloperWebhookTargetsData,
  listDeveloperWebhookTargetsForAdminData:
    mocks.listDeveloperWebhookTargetsForAdminData,
}));

import {
  createDeveloperApiKey,
  getDeveloperAdminData,
  getDeveloperPortalData,
} from "~/server/developer-api/service";

describe("getDeveloperPortalData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Tester",
        email: "tester@example.com",
      },
    });
    mocks.getDeveloperAccessData.mockResolvedValue(true);
    mocks.listApiKeysForUser.mockResolvedValue([
      {
        id: "active-key",
        name: "Active key",
        keyPrefix: "sharply_live_active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: null,
      },
      {
        id: "revoked-key",
        name: "Revoked key",
        keyPrefix: "sharply_live_revoked",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: new Date("2026-07-02T00:00:00.000Z"),
      },
    ]);
    mocks.getUsageForKeyIdsSince.mockResolvedValue([]);
    mocks.listDeveloperWebhookTargetsData.mockResolvedValue([]);
  });

  it("returns only active keys to the developer portal", async () => {
    const portal = await getDeveloperPortalData();

    expect(portal.keys).toEqual([
      expect.objectContaining({ id: "active-key", name: "Active key" }),
    ]);
    expect(mocks.getUsageForKeyIdsSince).toHaveBeenCalledWith(
      ["active-key"],
      expect.any(Date),
    );
    expect(portal.webhookTargetLimit).toBe(3);
    expect(portal.webhookEventTypes).toEqual(["gear.created"]);
    expect(portal.webhookTargets).toEqual([]);
  });

  it("creates a key through the atomic active-key limit data operation", async () => {
    mocks.createApiKeyWithinActiveLimitData.mockResolvedValue({ id: "key-1" });

    const result = await createDeveloperApiKey({ name: "Production" });

    expect(result.key).toEqual({ id: "key-1" });
    expect(result.secret).toMatch(/^sharply_live_/);
    expect(mocks.createApiKeyWithinActiveLimitData).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", name: "Production" }),
      3,
    );
  });

  it("reports the active-key limit when the atomic creation operation declines", async () => {
    mocks.createApiKeyWithinActiveLimitData.mockResolvedValue(null);

    await expect(
      createDeveloperApiKey({ name: "Production" }),
    ).rejects.toMatchObject({
      code: "key_limit_reached",
      status: 409,
    });
  });

  it("includes recent webhook targets and delivery records in admin data", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireRole.mockReturnValue(true);
    mocks.listDeveloperUsersData.mockResolvedValue([]);
    mocks.listAllApiKeysData.mockResolvedValue([]);
    mocks.getUsageForKeyIdsSince.mockResolvedValue([]);
    const targets = [
      { id: "target-1", endpointUrl: "https://hooks.example.com" },
    ];
    const deliveries = [{ id: "delivery-1", status: "FAILED" }];
    mocks.listDeveloperWebhookTargetsForAdminData.mockResolvedValue(targets);
    mocks.listDeveloperWebhookDeliveriesForAdminData.mockResolvedValue(
      deliveries,
    );

    const data = await getDeveloperAdminData();

    expect(data.webhookTargets).toBe(targets);
    expect(data.webhookDeliveries).toBe(deliveries);
    expect(mocks.requireRole).toHaveBeenCalledWith({ id: "admin-1" }, [
      "ADMIN",
    ]);
  });

  it("does not expose webhook observability data to non-admins", async () => {
    mocks.getSessionOrThrow.mockResolvedValue({ user: { id: "developer-1" } });
    mocks.requireRole.mockReturnValue(false);

    await expect(getDeveloperAdminData()).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
    expect(
      mocks.listDeveloperWebhookTargetsForAdminData,
    ).not.toHaveBeenCalled();
    expect(
      mocks.listDeveloperWebhookDeliveriesForAdminData,
    ).not.toHaveBeenCalled();
  });
});
