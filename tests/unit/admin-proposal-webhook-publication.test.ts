import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??=
  "postgres://postgres:postgres@localhost:5432/sharply";
process.env.PAYLOAD_SECRET ??= "test-payload-secret";
process.env.NEXT_PUBLIC_BASE_URL ??= "https://www.sharplyphoto.com";

const state = vi.hoisted(() => ({
  publicationState: "RUMORED" as "PUBLISHED" | "RUMORED" | "HIDDEN",
  tx: {} as Record<string, unknown>,
}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(state.tx),
  ),
  enqueueGearCreatedWebhookEvent: vi.fn(),
  normalizeProposalPayloadForDb: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: mocks }));
vi.mock("~/server/users/data", () => ({ getResolvedUserImageSql: vi.fn() }));
vi.mock("~/server/db/normalizers", () => ({
  normalizeProposalPayloadForDb: mocks.normalizeProposalPayloadForDb,
}));
vi.mock("~/server/developer-api/webhooks/data", () => ({
  enqueueGearCreatedWebhookEvent: mocks.enqueueGearCreatedWebhookEvent,
}));
vi.mock("~/env", () => ({
  env: { NEXT_PUBLIC_BASE_URL: "https://www.sharplyphoto.com" },
}));

import { approveProposalData } from "~/server/admin/proposals/data";

function setupTransaction() {
  const selection = {
    from: vi.fn(() => selection),
    where: vi.fn(() => selection),
    limit: vi.fn(async () => [
      {
        id: "gear-1",
        name: "Nikon Z6 III",
        slug: "nikon-z6-iii",
        gearType: "CAMERA",
        publicationState: state.publicationState,
      },
    ]),
  };
  const tx = {
    select: vi.fn(() => selection),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  state.tx = tx;
  return tx;
}

describe("proposal publication webhook trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.publicationState = "RUMORED";
    mocks.normalizeProposalPayloadForDb.mockReturnValue({
      core: { publicationState: "PUBLISHED" },
    });
    mocks.enqueueGearCreatedWebhookEvent.mockResolvedValue("event-1");
  });

  it("enqueues the first-publication event in the proposal transaction", async () => {
    const tx = setupTransaction();

    await expect(
      approveProposalData(
        "proposal-1",
        "gear-1",
        { core: { publicationState: "PUBLISHED" } },
        "editor-1",
      ),
    ).resolves.toBe(true);

    expect(mocks.enqueueGearCreatedWebhookEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        gearId: "gear-1",
        name: "Nikon Z6 III",
        slug: "nikon-z6-iii",
        gearType: "CAMERA",
      }),
    );
  });

  it("does not create a second event for an already-published item", async () => {
    state.publicationState = "PUBLISHED";
    setupTransaction();

    await expect(
      approveProposalData(
        "proposal-2",
        "gear-1",
        { core: { publicationState: "PUBLISHED" } },
        "editor-1",
      ),
    ).resolves.toBe(false);

    expect(mocks.enqueueGearCreatedWebhookEvent).not.toHaveBeenCalled();
  });
});
