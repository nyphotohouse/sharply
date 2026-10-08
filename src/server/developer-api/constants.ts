export const DEVELOPER_API_KEY_PREFIX = "sharply_live_";
export const DEVELOPER_API_KEY_DISPLAY_LENGTH = 20;
export const DEVELOPER_API_MAX_ACTIVE_KEYS = 3;
export const DEVELOPER_API_RATE_LIMIT = 60;
export const DEVELOPER_API_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEVELOPER_WEBHOOK_MAX_TARGETS = 3;
export const DEVELOPER_WEBHOOK_MAX_ATTEMPTS = 3;
export const DEVELOPER_WEBHOOK_RETRY_INTERVAL_MS = 5 * 60_000;
export const DEVELOPER_WEBHOOK_LOCK_TIMEOUT_MS = 2 * 60_000;
export const DEVELOPER_WEBHOOK_DISPATCH_BATCH_SIZE = 50;

export const DEVELOPER_WEBHOOK_EVENT_TYPES = ["gear.created"] as const;
export type DeveloperWebhookEventType =
  (typeof DEVELOPER_WEBHOOK_EVENT_TYPES)[number];

export const DEVELOPER_API_ENDPOINTS = [
  "search",
  "suggestions",
  "gear",
  "catalog",
] as const;

export const DEVELOPER_API_CATALOG_CACHE_TAG = "developer-api-catalog";

export type DeveloperApiEndpoint = (typeof DEVELOPER_API_ENDPOINTS)[number];
