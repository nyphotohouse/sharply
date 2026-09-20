import type { UserRole } from "~/lib/auth/additional-fields";

export const SHARPLY_OIDC_SCOPES = ["openid", "profile", "email"] as const;
export const SHARPLY_JWT_OPTIONS = {
  disableSettingJwtHeader: true,
} as const;
export const SHARPLY_OAUTH_LOGIN_PAGE = "/auth/signin";
export const SHARPLY_OAUTH_CONSENT_PAGE = "/auth/consent";

const OAUTH_ADMIN_ROLES = new Set<UserRole>(["ADMIN", "SUPERADMIN"]);

export function canManageOAuthClients(user?: Record<string, unknown> | null) {
  return (
    typeof user?.role === "string" &&
    OAUTH_ADMIN_ROLES.has(user.role as UserRole)
  );
}

export function canManageOAuthClientsFromContext(
  context?: { user?: Record<string, unknown> | null } | null,
) {
  return canManageOAuthClients(context?.user);
}
