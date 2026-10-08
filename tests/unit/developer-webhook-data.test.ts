import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: dbMocks }));

import {
  completeDeveloperWebhookDelivery,
  createDeveloperWebhookTargetData,
  deleteDeveloperWebhookTargetData,
  enqueueGearCreatedWebhookEvent,
  setDeveloperWebhookTargetEnabledData,
} from "~/server/developer-api/webhooks/data";
import { setDeveloperAccessData } from "~/server/developer-api/data";
import {
  developerWebhookDeliveries,
  developerWebhookEvents,
  developerWebhookTargets,
  users,
} from "~/server/db/schema";

function makeInsertBuilder(
  returningRows: unknown[] | ((values: unknown) => unknown[]),
) {
  let insertedValues: unknown;
  const builder = {
    values: vi.fn((values: unknown) => {
      insertedValues = values;
      return builder;
    }),
    onConflictDoNothing: vi.fn(() => builder),
    returning: vi.fn(async () =>
      typeof returningRows === "function"
        ? returningRows(insertedValues)
        : returningRows,
    ),
    then: (
      resolve: (value: undefined) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(undefined).then(resolve, reject),
  };
  return builder;
}

function makeEnqueueTransaction(eventWasInserted: boolean) {
  const insertCalls: Array<{
    table: unknown;
    builder: ReturnType<typeof makeInsertBuilder>;
  }> = [];
  const targets = [{ id: "target-1" }, { id: "target-2" }];
  const selectBuilder = {
    from: vi.fn(() => selectBuilder),
    innerJoin: vi.fn(() => selectBuilder),
    where: vi.fn(async () => targets),
  };
  const tx = {
    insert: vi.fn((table: unknown) => {
      const builder = makeInsertBuilder(
        table === developerWebhookEvents && eventWasInserted
          ? (values) => [{ id: (values as { id: string }).id }]
          : [],
      );
      insertCalls.push({ table, builder });
      return builder;
    }),
    select: vi.fn(() => selectBuilder),
  };
  return { tx, insertCalls };
}

describe("developer webhook data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes one immutable event and snapshots active target deliveries on the transaction", async () => {
    const { tx, insertCalls } = makeEnqueueTransaction(true);
    const createdAt = new Date("2026-10-08T15:04:05.000Z");
    const eventId = await enqueueGearCreatedWebhookEvent(tx as never, {
      gearId: "gear-1",
      name: "Nikon Z6 III",
      slug: "nikon-z6-iii",
      gearType: "CAMERA",
      publicBaseUrl: "https://www.sharplyphoto.com",
      now: createdAt,
    });

    const insertedEvent = insertCalls[0]?.builder.values.mock.calls[0]?.[0] as
      | { id: string }
      | undefined;
    expect(eventId).toBe(insertedEvent?.id);
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.table).toBe(developerWebhookEvents);
    expect(insertCalls[0]?.builder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: eventId,
        eventType: "gear.created",
        gearId: "gear-1",
        createdAt,
        payload: {
          id: eventId,
          type: "gear.created",
          createdAt: createdAt.toISOString(),
          data: {
            slug: "nikon-z6-iii",
            name: "Nikon Z6 III",
            gearType: "CAMERA",
            url: "https://www.sharplyphoto.com/gear/nikon-z6-iii",
            apiUrl: "https://www.sharplyphoto.com/api/v1/gear/nikon-z6-iii",
          },
        },
      }),
    );
    expect(insertCalls[0]?.builder.onConflictDoNothing).toHaveBeenCalledWith({
      target: [developerWebhookEvents.eventType, developerWebhookEvents.gearId],
    });
    expect(insertCalls[1]?.table).toBe(developerWebhookDeliveries);
    expect(insertCalls[1]?.builder.values).toHaveBeenCalledWith([
      expect.objectContaining({
        eventId,
        targetId: "target-1",
        status: "PENDING",
        attemptCount: 0,
        nextAttemptAt: createdAt,
      }),
      expect.objectContaining({
        eventId,
        targetId: "target-2",
        status: "PENDING",
        attemptCount: 0,
        nextAttemptAt: createdAt,
      }),
    ]);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it("does not fan out a duplicate event after the unique event identity conflicts", async () => {
    const { tx, insertCalls } = makeEnqueueTransaction(false);

    await expect(
      enqueueGearCreatedWebhookEvent(tx as never, {
        gearId: "gear-1",
        name: "Nikon Z6 III",
        slug: "nikon-z6-iii",
        gearType: "CAMERA",
        publicBaseUrl: "https://www.sharplyphoto.com",
      }),
    ).resolves.toBeNull();

    expect(insertCalls).toHaveLength(1);
    expect(tx.select).not.toHaveBeenCalled();
  });

  it("retries after the initial attempt and marks the third failed attempt final", async () => {
    const where = vi.fn(async () => undefined);
    const builder = { set: vi.fn(() => ({ where })) };
    dbMocks.update.mockReturnValue(builder);

    await completeDeveloperWebhookDelivery({
      id: "delivery-1",
      attemptCount: 1,
      now: new Date("2026-10-08T15:04:05.000Z"),
      succeeded: false,
      error: "HTTP 503",
      maxAttempts: 3,
      retryIntervalMs: 300_000,
    });
    expect(builder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PENDING",
        nextAttemptAt: new Date("2026-10-08T15:09:05.000Z"),
      }),
    );

    await completeDeveloperWebhookDelivery({
      id: "delivery-1",
      attemptCount: 3,
      now: new Date("2026-10-08T15:14:05.000Z"),
      succeeded: false,
      error: "HTTP 503",
      maxAttempts: 3,
      retryIntervalMs: 300_000,
    });
    expect(builder.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "FAILED",
        nextAttemptAt: expect.any(Date),
      }),
    );
  });

  it("pauses targets and cancels queued deliveries in the access revocation transaction", async () => {
    const updateTables: unknown[] = [];
    let accessEnabled = false;
    const tx = {
      update: vi.fn((table: unknown) => {
        updateTables.push(table);
        const builder = {
          where: vi.fn(() => builder),
          returning: vi.fn(async () =>
            table === users
              ? [{ id: "user-1", developerAccessEnabled: accessEnabled }]
              : table === developerWebhookTargets
                ? [{ id: "target-1" }]
                : [],
          ),
          then: (
            resolve: (value: undefined) => unknown,
            reject?: (error: unknown) => unknown,
          ) => Promise.resolve(undefined).then(resolve, reject),
        };
        return { set: vi.fn(() => builder) };
      }),
    };
    dbMocks.transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      setDeveloperAccessData("user-1", false),
    ).resolves.toMatchObject({
      id: "user-1",
      developerAccessEnabled: false,
    });

    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
    expect(updateTables).toEqual([
      users,
      developerWebhookTargets,
      developerWebhookDeliveries,
    ]);

    accessEnabled = true;
    updateTables.length = 0;
    await expect(setDeveloperAccessData("user-1", true)).resolves.toMatchObject(
      {
        developerAccessEnabled: true,
      },
    );
    expect(updateTables).toEqual([users]);
  });

  it("applies the target limit atomically before inserting a new target", async () => {
    const accountSelection = {
      from: vi.fn(() => accountSelection),
      where: vi.fn(() => accountSelection),
      for: vi.fn(() => accountSelection),
      limit: vi.fn(async () => [{ enabled: true }]),
    };
    const countSelection = {
      from: vi.fn(() => countSelection),
      where: vi.fn(() => countSelection),
      then: (
        resolve: (value: Array<{ count: number }>) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve([{ count: 3 }]).then(resolve, reject),
    };
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(accountSelection)
        .mockReturnValueOnce(countSelection),
      execute: vi.fn(),
      insert: vi.fn(),
    };
    dbMocks.transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      createDeveloperWebhookTargetData({
        userId: "user-1",
        eventType: "gear.created",
        endpointUrl: "https://hooks.example.com",
        signingSecretCiphertext: "encrypted",
        maxTargets: 3,
      }),
    ).resolves.toEqual({ status: "limit_reached" });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("pauses and resumes an owned target, canceling queued work on pause", async () => {
    const updateTables: unknown[] = [];
    const tx = {
      update: vi.fn((table: unknown) => {
        updateTables.push(table);
        const builder = {
          where: vi.fn(() => builder),
          returning: vi.fn(async () => [{ id: "target-1" }]),
          then: (
            resolve: (value: undefined) => unknown,
            reject?: (error: unknown) => unknown,
          ) => Promise.resolve(undefined).then(resolve, reject),
        };
        return { set: vi.fn(() => builder) };
      }),
    };
    dbMocks.transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      setDeveloperWebhookTargetEnabledData({
        targetId: "target-1",
        userId: "user-1",
        enabled: false,
      }),
    ).resolves.toBe(true);
    expect(updateTables).toEqual([
      developerWebhookTargets,
      developerWebhookDeliveries,
    ]);

    updateTables.length = 0;
    await expect(
      setDeveloperWebhookTargetEnabledData({
        targetId: "target-1",
        userId: "user-1",
        enabled: true,
      }),
    ).resolves.toBe(true);
    expect(updateTables).toEqual([developerWebhookTargets]);
  });

  it("deletes only the target that belongs to the supplied owner", async () => {
    const returning = vi.fn(async () => [{ id: "target-1" }]);
    const where = vi.fn(() => ({ returning }));
    dbMocks.delete.mockReturnValue({ where });

    await expect(
      deleteDeveloperWebhookTargetData({
        targetId: "target-1",
        userId: "user-1",
      }),
    ).resolves.toBe(true);
    expect(dbMocks.delete).toHaveBeenCalledWith(developerWebhookTargets);
    expect(where).toHaveBeenCalledOnce();
  });
});
