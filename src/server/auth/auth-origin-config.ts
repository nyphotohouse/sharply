type AuthOriginEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_BASE_URL?: string;
  AUTH_ADDITIONAL_TRUSTED_ORIGINS?: string;
  AUTH_BASE_URL?: string;
  BETTER_AUTH_BASE_URL?: string;
  BETTER_AUTH_URL?: string;
  NEXT_PUBLIC_BETTER_AUTH_URL?: string;
};

const STATIC_AUTH_BASE_URL_KEYS = [
  "AUTH_BASE_URL",
  "BETTER_AUTH_BASE_URL",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
] as const;

function normalizeTrustedOrigin(origin?: string) {
  if (!origin) return null;
  const value = origin.trim();
  if (!value) return null;
  if (value.includes("*") || value.includes("?")) return value;
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function parseTrustedOrigins(value?: string) {
  return uniq(
    (value ?? "")
      .split(",")
      .map(normalizeTrustedOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
}

export function resolveAuthOriginConfig(env: AuthOriginEnv) {
  const baseTrustedOrigin = normalizeTrustedOrigin(
    env.NEXT_PUBLIC_BASE_URL ?? "",
  );
  const additionalTrustedOrigins = parseTrustedOrigins(
    env.AUTH_ADDITIONAL_TRUSTED_ORIGINS,
  );
  const staticAuthBaseEntry = STATIC_AUTH_BASE_URL_KEYS.map((key) => ({
    key,
    value: normalizeTrustedOrigin(env[key]),
  })).find((entry) => Boolean(entry.value));

  const trustedOrigins = uniq([
    ...(env.NODE_ENV !== "production" ? ["http://localhost:3000"] : []),
    ...(baseTrustedOrigin ? [baseTrustedOrigin] : []),
    ...additionalTrustedOrigins,
  ]);

  const warning =
    staticAuthBaseEntry?.value && additionalTrustedOrigins.length > 0
      ? [
          "[auth] AUTH_ADDITIONAL_TRUSTED_ORIGINS is configured,",
          `but ${staticAuthBaseEntry.key} is pinning OAuth callbacks to ${staticAuthBaseEntry.value}.`,
          "Unset AUTH_BASE_URL, BETTER_AUTH_BASE_URL, BETTER_AUTH_URL, and NEXT_PUBLIC_BETTER_AUTH_URL to allow request-origin OAuth callbacks.",
        ].join(" ")
      : null;

  return {
    trustedOrigins,
    resolvedAuthBaseURL:
      staticAuthBaseEntry?.value ?? baseTrustedOrigin ?? undefined,
    staticAuthBaseURL: staticAuthBaseEntry?.value ?? null,
    staticAuthBaseURLSource: staticAuthBaseEntry?.key ?? null,
    warning,
  };
}
