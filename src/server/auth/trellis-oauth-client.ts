export const TRELLIS_OAUTH_CLIENTS = {
  local: {
    name: "trellis-local",
    redirectUri: "http://localhost:3001/api/auth/callback/sharply",
  },
  production: {
    name: "trellis-production",
    redirectUri: "https://trellis.photo/api/auth/callback/sharply",
  },
} as const;

export type TrellisOAuthTarget = keyof typeof TRELLIS_OAUTH_CLIENTS;

export function isTrellisOAuthTarget(
  value: string | undefined,
): value is TrellisOAuthTarget {
  return value === "local" || value === "production";
}

export function assertTrellisOAuthClientIsUnique(
  existingClientId: string | undefined,
  name: string,
) {
  if (existingClientId) {
    throw new Error(
      `OAuth client ${name} already exists; refusing to duplicate it.`,
    );
  }
}

export function createTrellisOAuthClientRegistration(
  target: TrellisOAuthTarget,
) {
  const spec = TRELLIS_OAUTH_CLIENTS[target];
  return {
    spec,
    skipConsent: true,
    body: {
      client_name: spec.name,
      redirect_uris: [spec.redirectUri],
      scope: "openid profile email",
      token_endpoint_auth_method: "client_secret_basic" as const,
      grant_types: ["authorization_code" as const],
      response_types: ["code" as const],
      type: "web" as const,
    },
  };
}
