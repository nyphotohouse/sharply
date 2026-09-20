import { describe, expect, it } from "vitest";

import {
  canManageOAuthClients,
  SHARPLY_OIDC_SCOPES,
} from "~/server/auth/oauth-provider-config";
import {
  assertTrellisOAuthClientIsUnique,
  createTrellisOAuthClientRegistration,
  TRELLIS_OAUTH_CLIENTS,
} from "~/server/auth/trellis-oauth-client";

describe("Sharply OAuth provider", () => {
  it("limits client management to administrators", () => {
    expect(canManageOAuthClients({ role: "USER" })).toBe(false);
    expect(canManageOAuthClients({ role: "EDITOR" })).toBe(false);
    expect(canManageOAuthClients({ role: "ADMIN" })).toBe(true);
    expect(canManageOAuthClients({ role: "SUPERADMIN" })).toBe(true);
    expect(canManageOAuthClients()).toBe(false);
  });

  it("exposes only the identity scopes Trellis needs", () => {
    expect(SHARPLY_OIDC_SCOPES).toEqual(["openid", "profile", "email"]);
  });

  it("uses exact local and production redirect URIs", () => {
    expect(TRELLIS_OAUTH_CLIENTS).toEqual({
      local: {
        name: "trellis-local",
        redirectUri: "http://localhost:3001/api/auth/callback/sharply",
      },
      production: {
        name: "trellis-production",
        redirectUri: "https://trellis.photo/api/auth/callback/sharply",
      },
    });
  });

  it("provisions a trusted confidential authorization-code client", () => {
    const registration = createTrellisOAuthClientRegistration("production");

    expect(registration.skipConsent).toBe(true);
    expect(registration.body).toMatchObject({
      redirect_uris: ["https://trellis.photo/api/auth/callback/sharply"],
      scope: "openid profile email",
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
  });

  it("refuses duplicate environment clients", () => {
    expect(() =>
      assertTrellisOAuthClientIsUnique("existing-id", "trellis-production"),
    ).toThrow("already exists");
    expect(() =>
      assertTrellisOAuthClientIsUnique(undefined, "trellis-production"),
    ).not.toThrow();
  });
});
