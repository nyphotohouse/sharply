import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??=
  "postgres://postgres:postgres@localhost:5432/sharply";
process.env.PAYLOAD_SECRET ??= "test-payload-secret";
process.env.NEXT_PUBLIC_BASE_URL ??= "https://www.sharplyphoto.com";

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    DEVELOPER_WEBHOOK_ENCRYPTION_KEY: "07".repeat(32),
    NEXT_PUBLIC_BASE_URL: "https://www.sharplyphoto.com",
  },
}));

import {
  createWebhookSignature,
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
  isPublicWebhookIp,
  postSignedWebhook,
  resolvePublicWebhookEndpoint,
} from "~/server/developer-api/webhooks/security";

describe("developer webhook security", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts signing secrets with authenticated encryption", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptWebhookSigningSecret("whsec_test", key);

    expect(encrypted).not.toContain("whsec_test");
    expect(decryptWebhookSigningSecret(encrypted, key)).toBe("whsec_test");
    expect(() =>
      decryptWebhookSigningSecret(encrypted, Buffer.alloc(32, 8)),
    ).toThrow();
  });

  it("signs the timestamp and exact JSON body with HMAC-SHA256", () => {
    const params = {
      secret: "whsec_signing-secret",
      timestamp: "1791471845",
      body: '{"type":"gear.created"}',
    };
    const expected = createHmac("sha256", params.secret)
      .update(`${params.timestamp}.${params.body}`)
      .digest("hex");

    expect(createWebhookSignature(params)).toBe(expected);
  });

  it.each([
    "127.0.0.1",
    "10.0.1.2",
    "172.20.0.4",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:192.168.1.2",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicWebhookIp(address)).toBe(false);
  });

  it.each(["8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicWebhookIp(address)).toBe(true);
    },
  );

  it("rejects HTTP and a hostname resolving only to a private address", async () => {
    await expect(
      resolvePublicWebhookEndpoint("http://hooks.example.com", async () => []),
    ).rejects.toThrow("must use HTTPS");

    await expect(
      resolvePublicWebhookEndpoint("https://hooks.example.com", async () => [
        { address: "10.1.2.3", family: 4 },
      ]),
    ).rejects.toThrow("public host");
  });

  it("pins delivery to a public resolution and signs the raw body", async () => {
    const sendRequest = vi.fn(
      async (_request: {
        url: URL;
        address: { address: string; family: number };
        body: string;
        headers: Record<string, string>;
      }) => 204,
    );
    const now = new Date("2026-10-08T15:04:05.000Z");

    await expect(
      postSignedWebhook({
        endpointUrl: "https://hooks.example.com/events?source=sharply",
        secret: "whsec_delivery-secret",
        payload: { id: "event-1", type: "gear.created" },
        now,
        resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
        sendRequest,
      }),
    ).resolves.toEqual({ succeeded: true, statusCode: 204 });

    const request = sendRequest.mock.calls[0]?.[0];
    expect(request?.address.address).toBe("93.184.216.34");
    expect(request?.url.pathname).toBe("/events");
    expect(request?.headers["x-sharply-event-id"]).toBe("event-1");
    expect(request?.headers["x-sharply-timestamp"]).toBe("1791471845");
    expect(request?.headers["x-sharply-signature"]).toBe(
      `v1=${createWebhookSignature({
        secret: "whsec_delivery-secret",
        timestamp: "1791471845",
        body: request?.body ?? "",
      })}`,
    );
  });

  it("treats non-2xx endpoint responses as failed delivery", async () => {
    await expect(
      postSignedWebhook({
        endpointUrl: "https://hooks.example.com",
        secret: "whsec_delivery-secret",
        payload: { id: "event-1" },
        resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
        sendRequest: async () => 302,
      }),
    ).resolves.toEqual({ succeeded: false, statusCode: 302 });
  });
});
