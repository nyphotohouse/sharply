import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { unstable_cache } from "next/cache";
import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";
import {
  fetchGearBySlug,
  fetchRandomLowCompletionGearUrl,
} from "~/server/gear/service";
import { getSuggestions, searchGear } from "~/server/search/service";
import type {
  EnrichedCameraSpecs,
  FixedLensSpecs,
  GearItem,
  GearRegion,
  LensSpecs,
} from "~/types/gear";
import {
  DEVELOPER_API_KEY_DISPLAY_LENGTH,
  DEVELOPER_API_CATALOG_CACHE_TAG,
  DEVELOPER_API_KEY_PREFIX,
  DEVELOPER_API_MAX_ACTIVE_KEYS,
  DEVELOPER_API_RATE_LIMIT,
  DEVELOPER_API_RATE_LIMIT_WINDOW_MS,
  DEVELOPER_WEBHOOK_EVENT_TYPES,
  DEVELOPER_WEBHOOK_MAX_TARGETS,
  type DeveloperApiEndpoint,
} from "./constants";
import {
  consumeRateLimitBucket,
  createApiKeyWithinActiveLimitData,
  findUsableApiKeyByHash,
  fetchDeveloperGearMountsData,
  fetchDeveloperGearLineageData,
  fetchDeveloperCatalogData,
  fetchDeveloperSensorFormatsData,
  getDeveloperAccessData,
  getUsageForKeyIdsSince,
  incrementUsageData,
  listApiKeysForUser,
  listAllApiKeysData,
  listDeveloperUsersData,
  revokeAllApiKeysForUser,
  revokeApiKeyData,
  setDeveloperAccessData,
  touchApiKeyLastUsed,
  type DeveloperApiMount,
  type DeveloperApiGearLineageItem,
  type DeveloperApiSensorFormat,
} from "./data";
import { DeveloperApiError } from "./errors";
import { parseKeyName } from "./schemas";
import { serializeDeveloperCatalogData } from "./serializers";
import { listDeveloperWebhookTargetsData } from "./webhooks/data";

export type DeveloperApiCredential = {
  apiKeyId: string;
  userId: string;
  keyPrefix: string;
};

export type DeveloperApiCameraSpecs = Omit<
  EnrichedCameraSpecs,
  "gearId" | "sensorFormatId"
> & {
  sensorFormat: DeveloperApiSensorFormat | null;
};

export type DeveloperApiLensSpecs = Omit<
  LensSpecs,
  "gearId" | "imageCircleSizeId"
> & {
  imageCircle: DeveloperApiSensorFormat | null;
};

export type DeveloperApiFixedLensSpecs = Omit<
  FixedLensSpecs,
  "gearId" | "imageCircleSizeId"
> & {
  imageCircle: DeveloperApiSensorFormat | null;
};

export type DeveloperApiGear = Omit<
  GearItem,
  | "mountIds"
  | "mounts"
  | "cameraSpecs"
  | "lensSpecs"
  | "fixedLensSpecs"
  | "mpbMaxPriceUsdCents"
  | "usedPriceProjection"
> & {
  mpbMaxPriceUsdCents: GearItem["mpbMaxPriceUsdCents"];
  usedPriceProjection: GearItem["usedPriceProjection"];
  mounts: DeveloperApiMount[];
  cameraSpecs: DeveloperApiCameraSpecs | null;
  lensSpecs: DeveloperApiLensSpecs | null;
  fixedLensSpecs: DeveloperApiFixedLensSpecs | null;
  predecessor: Omit<DeveloperApiGearLineageItem, "id"> | null;
  successor: Omit<DeveloperApiGearLineageItem, "id"> | null;
};

export type DeveloperApiCatalogSnapshot = {
  version: string;
  generatedAt: string;
  itemCount: number;
  data: ReturnType<typeof serializeDeveloperCatalogData>;
};

const getCachedDeveloperCatalogSnapshot = unstable_cache(
  async (): Promise<DeveloperApiCatalogSnapshot> => {
    const data = serializeDeveloperCatalogData(
      await fetchDeveloperCatalogData(),
    );
    const version = `sha256-${createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex")}`;

    return {
      version,
      generatedAt: new Date().toISOString(),
      itemCount: data.length,
      data,
    };
  },
  ["developer-api-catalog-v1"],
  { revalidate: false, tags: [DEVELOPER_API_CATALOG_CACHE_TAG] },
);

export async function getDeveloperCatalogSnapshot() {
  return getCachedDeveloperCatalogSnapshot();
}

export function createDeveloperCatalogEtag(version: string) {
  return `"${version}"`;
}

export function matchesDeveloperCatalogEtag(
  ifNoneMatch: string | null,
  etag: string,
) {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(",").some((candidate) => {
    const tag = candidate.trim();
    return tag === "*" || tag.replace(/^W\//i, "") === etag;
  });
}

function utcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcMinute(date: Date) {
  return new Date(
    Math.floor(date.getTime() / DEVELOPER_API_RATE_LIMIT_WINDOW_MS) *
      DEVELOPER_API_RATE_LIMIT_WINDOW_MS,
  );
}

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function newApiKey() {
  const secret = randomBytes(32).toString("base64url");
  const value = `${DEVELOPER_API_KEY_PREFIX}${secret}`;
  return {
    value,
    keyHash: hashApiKey(value),
    keyPrefix: value.slice(0, DEVELOPER_API_KEY_DISPLAY_LENGTH),
  };
}

export function getBearerApiKey(authorization: string | null) {
  if (!authorization) {
    throw new DeveloperApiError(
      "missing_api_key",
      401,
      "An API key is required.",
    );
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const apiKey = match?.[1];
  if (!apiKey?.startsWith(DEVELOPER_API_KEY_PREFIX)) {
    throw new DeveloperApiError(
      "invalid_api_key",
      401,
      "The supplied API key is invalid.",
    );
  }
  return apiKey;
}

export async function authenticateDeveloperApiKey(
  authorization: string | null,
) {
  const value = getBearerApiKey(authorization);
  const result = await findUsableApiKeyByHash(hashApiKey(value));
  if (!result?.developerAccessEnabled) {
    throw new DeveloperApiError(
      "invalid_api_key",
      401,
      "The supplied API key is invalid.",
    );
  }
  return {
    apiKeyId: result.key.id,
    userId: result.key.userId,
    keyPrefix: result.key.keyPrefix,
  } satisfies DeveloperApiCredential;
}

export async function consumeDeveloperRateLimit(
  apiKeyId: string,
  now = new Date(),
) {
  const windowStart = utcMinute(now);
  const requestCount = await consumeRateLimitBucket({ apiKeyId, windowStart });
  const resetAt = new Date(
    windowStart.getTime() + DEVELOPER_API_RATE_LIMIT_WINDOW_MS,
  );
  return {
    allowed: requestCount <= DEVELOPER_API_RATE_LIMIT,
    remaining: Math.max(0, DEVELOPER_API_RATE_LIMIT - requestCount),
    resetAt,
  };
}

export async function recordDeveloperApiUsage(params: {
  apiKeyId: string;
  endpoint: DeveloperApiEndpoint;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  await Promise.all([
    incrementUsageData({
      apiKeyId: params.apiKeyId,
      endpoint: params.endpoint,
      usageDate: utcDay(now),
    }),
    touchApiKeyLastUsed(params.apiKeyId),
  ]);
}

export async function requireDeveloperPortalUser() {
  const session = await getSessionOrThrow();
  const enabled = await getDeveloperAccessData(session.user.id);
  if (!enabled) {
    throw new DeveloperApiError(
      "developer_access_required",
      403,
      "Developer API access has not been enabled for this account.",
    );
  }
  return session.user;
}

function summarizeUsage(
  usage: Awaited<ReturnType<typeof getUsageForKeyIdsSince>>,
  keyId: string,
  today: Date,
) {
  return usage.reduce(
    (summary, row) => {
      if (row.apiKeyId !== keyId) return summary;
      summary.last30Days += row.totalRequests;
      if (row.usageDate.getTime() === today.getTime())
        summary.today += row.totalRequests;
      return summary;
    },
    { today: 0, last30Days: 0 },
  );
}

export async function getDeveloperPortalData() {
  const user = await requireDeveloperPortalUser();
  const [allKeys, webhookTargets] = await Promise.all([
    listApiKeysForUser(user.id),
    listDeveloperWebhookTargetsData(user.id),
  ]);
  const keys = allKeys.filter((key) => key.revokedAt === null);
  const since = utcDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const usage = await getUsageForKeyIdsSince(
    keys.map((key) => key.id),
    since,
  );
  const today = utcDay(new Date());
  return {
    userName: user.name ?? user.email,
    keyLimit: DEVELOPER_API_MAX_ACTIVE_KEYS,
    rateLimit: DEVELOPER_API_RATE_LIMIT,
    keys: keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      usage: summarizeUsage(usage, key.id, today),
    })),
    webhookTargetLimit: DEVELOPER_WEBHOOK_MAX_TARGETS,
    webhookEventTypes: DEVELOPER_WEBHOOK_EVENT_TYPES,
    webhookTargets,
  };
}

export async function createDeveloperApiKey(input: {
  name: unknown;
  userId?: string;
}) {
  const sessionUser = await requireDeveloperPortalUser();
  const userId = input.userId ?? sessionUser.id;
  if (userId !== sessionUser.id) {
    throw new DeveloperApiError(
      "forbidden",
      403,
      "You cannot create a key for another user.",
    );
  }
  const name = parseKeyName(input.name);
  return createDeveloperApiKeyForUser({
    userId,
    name,
    limitErrorMessage: "You can have up to three active API keys.",
  });
}

export async function revokeDeveloperApiKey(keyId: string) {
  const user = await requireDeveloperPortalUser();
  const key = await revokeApiKeyData({
    keyId,
    userId: user.id,
    revokedByUserId: user.id,
  });
  if (!key) throw new DeveloperApiError("not_found", 404, "API key not found.");
}

async function requireDeveloperAdmin() {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN"])) {
    throw new DeveloperApiError(
      "forbidden",
      403,
      "Administrator access is required.",
    );
  }
  return session.user;
}

export async function getDeveloperAdminData() {
  await requireDeveloperAdmin();
  const [users, keys] = await Promise.all([
    listDeveloperUsersData(),
    listAllApiKeysData(),
  ]);
  const usage = await getUsageForKeyIdsSince(
    keys.map((key) => key.id),
    utcDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)),
  );
  const today = utcDay(new Date());

  return {
    users: users.map((user) => {
      const userKeys = keys.filter((key) => key.userId === user.id);
      return {
        ...user,
        activeKeyCount: userKeys.filter((key) => key.revokedAt === null).length,
        usage: userKeys.reduce(
          (summary, key) => {
            const keyUsage = summarizeUsage(usage, key.id, today);
            return {
              today: summary.today + keyUsage.today,
              last30Days: summary.last30Days + keyUsage.last30Days,
            };
          },
          { today: 0, last30Days: 0 },
        ),
      };
    }),
    keys: keys.map((key) => ({
      id: key.id,
      userId: key.userId,
      name: key.name,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    })),
  };
}

export async function setDeveloperAccessForUser(
  userId: string,
  enabled: boolean,
) {
  const admin = await requireDeveloperAdmin();
  const user = await setDeveloperAccessData(userId, enabled);
  if (!user) throw new DeveloperApiError("not_found", 404, "User not found.");
  if (!enabled) await revokeAllApiKeysForUser(userId, admin.id);
}

export async function createDeveloperApiKeyForAdmin(params: {
  userId: string;
  name: unknown;
}) {
  await requireDeveloperAdmin();
  const enabled = await getDeveloperAccessData(params.userId);
  if (!enabled) {
    throw new DeveloperApiError(
      "developer_access_required",
      403,
      "Grant developer access before creating a key for this user.",
    );
  }
  const name = parseKeyName(params.name);
  return createDeveloperApiKeyForUser({
    userId: params.userId,
    name,
    limitErrorMessage: "This user already has three active API keys.",
  });
}

async function createDeveloperApiKeyForUser(params: {
  userId: string;
  name: string;
  limitErrorMessage: string;
}) {
  const secret = newApiKey();
  const key = await createApiKeyWithinActiveLimitData(
    { userId: params.userId, name: params.name, ...secret },
    DEVELOPER_API_MAX_ACTIVE_KEYS,
  );
  if (!key) {
    throw new DeveloperApiError(
      "key_limit_reached",
      409,
      params.limitErrorMessage,
    );
  }
  return { key, secret: secret.value };
}

export async function revokeDeveloperApiKeyForAdmin(keyId: string) {
  const admin = await requireDeveloperAdmin();
  const key = await revokeApiKeyData({ keyId, revokedByUserId: admin.id });
  if (!key) throw new DeveloperApiError("not_found", 404, "API key not found.");
}

export async function searchDeveloperApi(
  query: string,
  page: number,
  limit: number,
) {
  return searchGear({
    query,
    page,
    pageSize: limit,
    sort: "relevance",
    includeTotal: true,
  });
}

export async function getDeveloperRandomLowCompletionGearUrl() {
  const pathname = await fetchRandomLowCompletionGearUrl();
  return pathname
    ? new URL(pathname, "https://www.sharplyphoto.com").toString()
    : null;
}

export async function getDeveloperSuggestions(
  query: string,
  limit: number,
  region: GearRegion,
) {
  return getSuggestions(query, limit, region);
}

export async function getDeveloperGearForSpecs(slug: string) {
  return fetchGearBySlug(slug);
}

function composeDeveloperCameraSpecs(
  specs: EnrichedCameraSpecs | null | undefined,
  sensorFormat: DeveloperApiSensorFormat | null,
): DeveloperApiCameraSpecs | null {
  if (!specs) return null;
  const { gearId, sensorFormatId, ...values } = specs;
  void gearId;
  void sensorFormatId;
  return { ...values, sensorFormat };
}

function composeDeveloperLensSpecs(
  specs: LensSpecs | null | undefined,
  imageCircle: DeveloperApiSensorFormat | null,
): DeveloperApiLensSpecs | null {
  if (!specs) return null;
  const { gearId, imageCircleSizeId, ...values } = specs;
  void gearId;
  void imageCircleSizeId;
  return { ...values, imageCircle };
}

function composeDeveloperFixedLensSpecs(
  specs: FixedLensSpecs | null | undefined,
  imageCircle: DeveloperApiSensorFormat | null,
): DeveloperApiFixedLensSpecs | null {
  if (!specs) return null;
  const { gearId, imageCircleSizeId, ...values } = specs;
  void gearId;
  void imageCircleSizeId;
  return { ...values, imageCircle };
}

export async function getDeveloperGear(slug: string) {
  const gear = await getDeveloperGearForSpecs(slug);
  const { mountIds, mounts: legacyMounts, ...gearWithoutMountTaxonomy } = gear;
  void mountIds;
  void legacyMounts;
  const [mounts, sensorFormats, lineage] = await Promise.all([
    fetchDeveloperGearMountsData(gear.id),
    fetchDeveloperSensorFormatsData([
      gear.cameraSpecs?.sensorFormatId,
      gear.lensSpecs?.imageCircleSizeId,
      gear.fixedLensSpecs?.imageCircleSizeId,
    ]),
    fetchDeveloperGearLineageData([
      gear.predecessorGearId,
      gear.successorGearId,
    ]),
  ]);

  return {
    ...gearWithoutMountTaxonomy,
    mounts,
    predecessor: gear.predecessorGearId
      ? (() => {
          const item = lineage.get(gear.predecessorGearId);
          return item ? { slug: item.slug, name: item.name } : null;
        })()
      : null,
    successor: gear.successorGearId
      ? (() => {
          const item = lineage.get(gear.successorGearId);
          return item ? { slug: item.slug, name: item.name } : null;
        })()
      : null,
    cameraSpecs: composeDeveloperCameraSpecs(
      gear.cameraSpecs,
      (gear.cameraSpecs?.sensorFormatId
        ? sensorFormats.get(gear.cameraSpecs.sensorFormatId)
        : null) ?? null,
    ),
    lensSpecs: composeDeveloperLensSpecs(
      gear.lensSpecs,
      (gear.lensSpecs?.imageCircleSizeId
        ? sensorFormats.get(gear.lensSpecs.imageCircleSizeId)
        : null) ?? null,
    ),
    fixedLensSpecs: composeDeveloperFixedLensSpecs(
      gear.fixedLensSpecs,
      (gear.fixedLensSpecs?.imageCircleSizeId
        ? sensorFormats.get(gear.fixedLensSpecs.imageCircleSizeId)
        : null) ?? null,
    ),
  } satisfies DeveloperApiGear;
}
