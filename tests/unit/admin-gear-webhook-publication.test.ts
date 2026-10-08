import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??=
  "postgres://postgres:postgres@localhost:5432/sharply";
process.env.PAYLOAD_SECRET ??= "test-payload-secret";
process.env.NEXT_PUBLIC_BASE_URL ??= "https://www.sharplyphoto.com";

const state = vi.hoisted(() => ({
  gear: {
    id: "gear-1",
    name: "Nikon Z6 III",
    slug: "nikon-z-6-iii",
    gearType: "CAMERA",
    publicationState: "RUMORED" as "PUBLISHED" | "RUMORED" | "HIDDEN",
  },
  tx: {} as Record<string, unknown>,
}));

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(state.tx),
  ),
  enqueueGearCreatedWebhookEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: mocks }));
vi.mock("~/server/developer-api/webhooks/data", () => ({
  enqueueGearCreatedWebhookEvent: mocks.enqueueGearCreatedWebhookEvent,
}));
vi.mock("~/env", () => ({
  env: { NEXT_PUBLIC_BASE_URL: "https://www.sharplyphoto.com" },
}));

import { updateGearPublicationStateData } from "~/server/admin/gear/data";
import { gear } from "~/server/db/schema";

function setupTransaction() {
  const selection = {
    from: vi.fn(() => selection),
    where: vi.fn(() => selection),
    limit: vi.fn(async () => [{ ...state.gear }]),
  };
  const updateValues: unknown[] = [];
  const tx = {
    select: vi.fn(() => selection),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => {
        updateValues.push(values);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => [
              {
                id: state.gear.id,
                slug: state.gear.slug,
                publicationState:
                  (values as { publicationState?: string }).publicationState ??
                  state.gear.publicationState,
              },
            ]),
          })),
        };
      }),
    })),
  };
  state.tx = tx;
  return { tx, updateValues };
}

describe("gear publication webhook trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.gear.publicationState = "RUMORED";
    mocks.enqueueGearCreatedWebhookEvent.mockResolvedValue("event-1");
  });

  it("enqueues the event inside the same transaction when gear becomes public", async () => {
    const { tx } = setupTransaction();

    await expect(
      updateGearPublicationStateData(
        { gearId: "gear-1", publicationState: "PUBLISHED" },
        "https://www.sharplyphoto.com",
      ),
    ).resolves.toEqual({
      id: "gear-1",
      slug: "nikon-z-6-iii",
      publicationState: "PUBLISHED",
    });

    expect(mocks.enqueueGearCreatedWebhookEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        gearId: "gear-1",
        name: "Nikon Z6 III",
        slug: "nikon-z-6-iii",
        gearType: "CAMERA",
        publicBaseUrl: "https://www.sharplyphoto.com",
      }),
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(gear).toBeDefined();
  });

  it("does not enqueue another event when an already-public item is updated", async () => {
    const { tx } = setupTransaction();
    state.gear.publicationState = "PUBLISHED";

    await updateGearPublicationStateData({
      gearId: "gear-1",
      publicationState: "PUBLISHED",
    });

    expect(mocks.enqueueGearCreatedWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(tx).toBeDefined();
  });
});
