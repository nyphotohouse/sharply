import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { lookup } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { request as httpsRequest } from "node:https";

const SIGNING_SECRET_PREFIX = "whsec_";
const REQUEST_TIMEOUT_MS = 10_000;

type ResolvedAddress = { address: string; family: number };

const blockedIpv4 = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(subnet, prefix, "ipv4");
}

const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
const blockedIpv6 = new BlockList();
for (const [subnet, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const) {
  blockedIpv6.addSubnet(subnet, prefix, "ipv6");
}

function ipv4FromMappedIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith("::ffff:")) return null;
  const suffix = normalized.slice("::ffff:".length);
  if (isIP(suffix) === 4) return suffix;

  const groups = suffix.split(":");
  if (
    groups.length !== 2 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }
  const first = Number.parseInt(groups[0]!, 16);
  const second = Number.parseInt(groups[1]!, 16);
  return [first >> 8, first & 255, second >> 8, second & 255].join(".");
}

export function isPublicWebhookIp(address: string) {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family !== 6) return false;

  const mappedIpv4 = ipv4FromMappedIpv6(address);
  if (mappedIpv4) return isPublicWebhookIp(mappedIpv4);
  return (
    globalIpv6.check(address, "ipv6") && !blockedIpv6.check(address, "ipv6")
  );
}

function lookupAddresses(hostname: string): Promise<ResolvedAddress[]> {
  if (isIP(hostname)) {
    return Promise.resolve([{ address: hostname, family: isIP(hostname) }]);
  }
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
}

export async function resolvePublicWebhookEndpoint(
  endpointUrl: string,
  resolveAddresses: (
    hostname: string,
  ) => Promise<ResolvedAddress[]> = lookupAddresses,
) {
  if (endpointUrl.length > 2048) throw new Error("Webhook URL is too long.");

  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    throw new Error("Enter a valid HTTPS URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !url.hostname
  ) {
    throw new Error(
      "Webhook targets must use HTTPS and cannot include credentials or fragments.",
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Webhook targets must resolve to a public host.");
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolveAddresses(hostname);
  } catch {
    throw new Error("The webhook host could not be resolved.");
  }
  const publicAddress = addresses.find(({ address }) =>
    isPublicWebhookIp(address),
  );
  if (!publicAddress) {
    throw new Error("Webhook targets must resolve to a public host.");
  }

  return { url, address: publicAddress };
}

function encryptionKey() {
  const key = process.env.DEVELOPER_WEBHOOK_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error(
      "DEVELOPER_WEBHOOK_ENCRYPTION_KEY must be a 32-byte hexadecimal key.",
    );
  }
  return Buffer.from(key, "hex");
}

export function createWebhookSigningSecret() {
  return `${SIGNING_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function encryptWebhookSigningSecret(
  secret: string,
  key = encryptionKey(),
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptWebhookSigningSecret(
  encrypted: string,
  key = encryptionKey(),
) {
  const [version, iv, authTag, ciphertext, extra] = encrypted.split(".");
  if (version !== "v1" || !iv || !authTag || !ciphertext || extra) {
    throw new Error("Stored webhook signing secret is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createWebhookSignature(params: {
  secret: string;
  timestamp: string;
  body: string;
}) {
  return createHmac("sha256", params.secret)
    .update(`${params.timestamp}.${params.body}`)
    .digest("hex");
}

function sendPinnedHttpsRequest(params: {
  url: URL;
  address: ResolvedAddress;
  body: string;
  headers: Record<string, string>;
}) {
  return new Promise<number>((resolve, reject) => {
    const hostname = params.url.hostname.replace(/^\[|\]$/g, "");
    const pinnedLookup: LookupFunction = (
      _requestedHost,
      options,
      callback,
    ) => {
      if (typeof options === "object" && options.all) {
        callback(null, [params.address]);
      } else {
        callback(null, params.address.address, params.address.family);
      }
    };
    const request = httpsRequest(
      {
        hostname,
        port: params.url.port ? Number(params.url.port) : 443,
        path: `${params.url.pathname}${params.url.search}`,
        method: "POST",
        headers: { ...params.headers, host: params.url.host },
        lookup: pinnedLookup,
        servername: isIP(hostname) ? undefined : hostname,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.once("error", reject);
    request.end(params.body);
  });
}

export async function postSignedWebhook(params: {
  endpointUrl: string;
  secret: string;
  payload: Record<string, unknown>;
  resolveAddresses?: (hostname: string) => Promise<ResolvedAddress[]>;
  sendRequest?: typeof sendPinnedHttpsRequest;
  now?: Date;
}) {
  const { url, address } = await resolvePublicWebhookEndpoint(
    params.endpointUrl,
    params.resolveAddresses,
  );
  const body = JSON.stringify(params.payload);
  const timestamp = String(
    Math.floor((params.now ?? new Date()).getTime() / 1000),
  );
  const eventId =
    typeof params.payload.id === "string" ? params.payload.id : "";
  const signature = createWebhookSignature({
    secret: params.secret,
    timestamp,
    body,
  });
  const statusCode = await (params.sendRequest ?? sendPinnedHttpsRequest)({
    url,
    address,
    body,
    headers: {
      "content-type": "application/json",
      "user-agent": "Sharply-Webhooks/1.0",
      "x-sharply-event-id": eventId,
      "x-sharply-timestamp": timestamp,
      "x-sharply-signature": `v1=${signature}`,
    },
  });
  return {
    succeeded: statusCode >= 200 && statusCode < 300,
    statusCode,
  };
}
