# Authentication Guide

This guide shows how to work with authentication in Sharply using Better Auth (configured in `src/auth.ts`) across server components, client components, and API routes.

## Overview

- Better Auth is initialized in `src/auth.ts` with the Drizzle adapter.
- Sharply pins Better Auth and its compatible packages to `1.4.22`; keep the
  Trellis integration on the same Better Auth version.
- Client helpers (including `useSession`) are exported from `src/lib/auth/auth-client.ts`.
- Shared role helper (`requireRole`) lives in `src/lib/auth/auth-helpers.ts` and is safe to use in both server and client code (pure runtime check, no server APIs).
- Server session helper `getSessionOrThrow` is exported from `~/server/auth` (wraps `auth.api.getSession` with `headers` and throws 401 when missing).
- Auth tables in Postgres are `auth_sessions`, `auth_accounts`, `auth_verifications`, and `passkeys`; legacy NextAuth tables (`account`, `session`, `verification_token`) have been removed.
- When `DISCORD_GENERAL_LOGS_WEBHOOK_URL` is configured, each newly persisted user produces a best-effort Discord operational notice with their display name and signup provider. Delivery failures never interrupt account creation.

## Server Components and API Routes

### Getting the session

Use `getSessionOrThrow` (wraps `auth.api.getSession` with request headers). For custom handling (e.g., allow anonymous), call `auth.api.getSession` directly and branch on null.

```tsx
import { auth } from "~/auth";
import { headers } from "next/headers";
import { getSessionOrThrow } from "~/server/auth";

export default async function ServerComponent() {
  const session = await getSessionOrThrow();
  const user = session?.user;

  if (!session) {
    return <div>Please sign in</div>;
  }

  return <div>Welcome, {user?.name ?? "Sharply user"}!</div>;
}
```

### Role and permission checks

Use the shared helpers to enforce authentication and roles:

```tsx
import { redirect } from "next/navigation";
import { auth } from "~/auth";
import { headers } from "next/headers";
import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";

export default async function ProtectedPage() {
  const session = await getSessionOrThrow();

  if (!session || !requireRole(session.user, ["EDITOR"])) {
    redirect("/auth/signin");
  }

  return <div>Editor-only content</div>;
}

// If you just need the user and want an error on missing auth:
// const session = await getSessionOrThrow();
```

### API route pattern

```tsx
import { NextResponse } from "next/server";
import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";

export async function POST() {
  const session = await getSessionOrThrow();

  if (!requireRole(session.user, ["ADMIN"])) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  // ...handle request
  return NextResponse.json({ ok: true });
}
```

## Client Components

### Getting the session

Use the Better Auth client hook:

```tsx
"use client";

import { useSession } from "~/lib/auth/auth-client";

export function ClientComponent() {
  const { data, isPending, error } = useSession();
  const session = data?.session;

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Authentication error</div>;
  if (!session) return <div>Please sign in</div>;

  return <div>Welcome, {session.user.name ?? "Sharply user"}!</div>;
}
```

### Conditional rendering

```tsx
export function ConditionalComponent() {
  const { data } = useSession();
  const session = data?.session;

  return session ? (
    <div>Welcome back, {session.user.name ?? "friend"}!</div>
  ) : (
    <div>Please sign in to continue</div>
  );
}
```

## Session Types

Better Auth exports types you can import from `~/auth`:

```ts
import type { AuthSession, AuthUser, UserRole } from "~/auth";
```

Shape (simplified):

```ts
type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: UserRole; // USER | MODERATOR | EDITOR | ADMIN | SUPERADMIN
  memberNumber?: number | null;
  inviteId?: string | null;
  socialLinks?: unknown[]; // JSON array stored on the user
};

type AuthSession = {
  user: AuthUser;
  expires: string;
};
```

## Passkey storage

Passkey credentials are persisted in the `passkeys` table defined in `src/server/db/schema.ts`. Each row stores the credential metadata (`publicKey`, `credentialID`, `counter`, `deviceType`, `backedUp`, `transports`, `aaguid`, and `createdAt`) and links back to the owning user via `userId`. This lets you list or revoke registered passkeys without touching the low‑level Better Auth adapter, and the table is indexed by `userId` for quick lookups when showing the device list or enforcing session limits.

### Our passkey UX (Sharply)

- **Server config:** `passkey()` plugin is enabled in `src/auth.ts` and wired to the Drizzle adapter; `credentialID` is the expected field name in the schema.
- **Add flow:** `/profile/settings/add-passkey` pre-fills a device-friendly name (e.g., “Firefox on Windows”) based on browser/OS. Users can edit it before creation. Registration runs `passkey.addPasskey` and returns to settings.
- **Manage & list:** `/profile/settings` shows a collapsible “X passkeys configured” list with rename and delete actions (uses `passkey.updatePasskey` and `passkey.deletePasskey`). Last-used/created timestamps are displayed when present.
- **Sign-in:** The sign-in page includes “Sign in with passkey”. If no credential is found for the user, the UI toasts an error and prompts to sign up or use email/OAuth, then add a passkey in settings.
- **Authenticator choice:** We use the default passkey plugin options (both platform and cross‑platform allowed). Browsers may surface platform/phone first; if you want to bias to hardware keys, pass `authenticatorAttachment: "cross-platform"` to `passkey.addPasskey` (not currently enabled in UI).

## Sign-in / Sign-out (client)

```tsx
import { signIn, signOut } from "~/lib/auth/auth-client";

// OAuth sign-in with redirect you control
const { data, error } = await signIn.social({
  provider: "discord",
  callbackURL: "/dashboard",
  disableRedirect: true,
});
if (!error) {
  window.location.href = data.url ?? "/dashboard";
}

// Email OTP (if enabled)
// const { error } = await emailOtp.sendVerificationOtp({ email, type: "sign-in" });

// Sign out
await signOut({ callbackURL: "/" });
```

## OAuth callback hosts

Sharply separates the canonical site URL from the Better Auth callback host:

- `NEXT_PUBLIC_BASE_URL` is the canonical site URL used for metadata, absolute app links, SEO-sensitive server output, and as Better Auth's fallback base URL. The OAuth/OIDC provider requires this stable fallback during production initialization.
- `AUTH_ADDITIONAL_TRUSTED_ORIGINS` adds extra allowed post-login callback origins, such as a fixed `https://myapp.vercel.app`.
- `AUTH_BASE_URL`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_BETTER_AUTH_URL` are single-host auth overrides. If any of them are set, they take precedence over `NEXT_PUBLIC_BASE_URL` for Better Auth callbacks.
- Sharply’s browser auth client resolves its Better Auth base URL from `window.location.origin`, which keeps sign-in and account-link requests on the host where the user started the flow instead of relying on Better Auth’s client-side env inference.

For multi-origin OAuth on a main domain plus a fixed `vercel.app` host:

- keep `NEXT_PUBLIC_BASE_URL` pointed at the canonical main domain
- set `AUTH_ADDITIONAL_TRUSTED_ORIGINS` to the fixed alternate host
- set an auth-base override to the exact host whose server handles the OAuth callback; otherwise Better Auth uses `NEXT_PUBLIC_BASE_URL`

Provider consoles still need exact callback URLs registered for every supported host, for example:

- `https://www.sharplyphoto.com/api/auth/callback/discord`
- `https://myapp.vercel.app/api/auth/callback/discord`
- `https://www.sharplyphoto.com/api/auth/callback/google`
- `https://myapp.vercel.app/api/auth/callback/google`

## Sharply as Trellis's identity provider

Sharply exposes a first-party OpenID Connect provider for Trellis. The public
discovery endpoints are:

- Local: `http://localhost:3000/api/auth/.well-known/openid-configuration`
- Production: `https://www.sharplyphoto.com/api/auth/.well-known/openid-configuration`
- Authorization-server metadata is also available at
  `/.well-known/oauth-authorization-server/api/auth`.

The provider supports only the `openid`, `profile`, and `email` scopes for this
integration. Dynamic client registration is disabled. Trellis clients use the
authorization-code flow with PKCE and are confidential clients whose secrets
are stored hashed in Sharply's database.

After applying the OAuth schema migration, provision a client against the
database for the desired environment:

```bash
OAUTH_PROVISION_ADMIN_COOKIE='better-auth.session_token=…' \
  npm run oauth:provision:trellis -- local

OAUTH_PROVISION_ADMIN_COOKIE='better-auth.session_token=…' \
  npm run oauth:provision:trellis -- production
```

Copy the returned `client_id` and `client_secret` immediately into the matching
Trellis environment. The local callback is
`http://localhost:3001/api/auth/callback/sharply`; production uses
`https://trellis.photo/api/auth/callback/sharply`. Provisioning refuses to
create another client with the same environment name. Both clients are marked
as trusted first-party clients and therefore skip the consent screen.

The production client is intentionally registered with the apex callback above.
Vercel currently redirects the public apex to `www.trellis.photo`, so callback
logs may show the `www` host after that redirect. Keep Trellis's
`BETTER_AUTH_URL`, the Sharply client registration, and the provider config
aligned; changing the callback host requires re-provisioning the client.

The provisioning cookie must belong to an `ADMIN` or `SUPERADMIN`, must be
provided only for the command invocation, and must never be stored in a
deployment environment. OAuth-client read/update/delete/rotation operations
are likewise restricted to those roles. Rotate a compromised secret through
Better Auth's authenticated `/api/auth/oauth2/client/rotate-secret` endpoint,
update Trellis, verify sign-in, and then revoke or delete obsolete clients.

Trellis requires these deployment variables:

- `SHARPLY_OIDC_DISCOVERY_URL`
- `SHARPLY_CLIENT_ID`
- `SHARPLY_CLIENT_SECRET`
- `BETTER_AUTH_URL` matching the Trellis origin so its callback is exact

### Production OIDC edge protection

The OIDC endpoints are machine-to-machine APIs. In the Sharply Vercel project,
configure Firewall/Bot Protection rules to **bypass browser challenges** for
these exact routes (before any challenge rule):

- `GET /api/auth/.well-known/openid-configuration`
- `GET /.well-known/oauth-authorization-server/api/auth`
- `POST /api/auth/oauth2/token`
- `GET /api/auth/oauth2/userinfo`

`GET /api/auth/jwks` must also remain reachable; it currently returns normally
without a bypass rule. The `rateLimit.customRules` entries in `src/auth.ts`
only exempt the two discovery paths from Better Auth's application limiter; they
do not disable Vercel's edge challenge.

To verify the deployment, request discovery directly:

```bash
curl -i https://www.sharplyphoto.com/api/auth/.well-known/openid-configuration
```

Discovery must return `200` JSON and must not include
`x-vercel-mitigated: challenge`. A token request made without a valid body may
return an application-level `400`, but it must not return a Vercel challenge or
`429`. If Trellis redirects to `/signin?error=invalid_code` after the Sharply
authorization page, inspect the token endpoint first. After changing firewall
rules, start a new sign-in attempt because authorization codes are single-use.

## Development auth bypass

Sharply includes an opt-in dev login route for local work and automation:

- Set `DEV_AUTH=true` to enable it.
- Optionally set `DEV_AUTH_EMAIL` to choose which user email to sign in as. If no user exists, Sharply creates a default `"Development User"` row with that email through the existing Drizzle schema.
- `DEV_AUTH_LOCALHOST_ONLY` defaults to a localhost-only host check. Leave it enabled to require the incoming `Host` header to resolve to `localhost`; set it to `false` only when a non-localhost dev or CI hostname must use the bypass.
- Visit `/api/dev-login` to create a real Better Auth session and redirect to `/`.

This bypass stays disabled when `NODE_ENV=production` unless you also set `DEV_AUTH_PREVIEW=true` for a localhost-only preview/e2e run. `DEV_AUTH=true` by itself is still ignored in production. The route also returns `404` when the host check fails, so open-source deployments do not accidentally expose it on public domains.

## Protected layout pattern

```tsx
// src/app/[locale]/(protected)/layout.tsx
import { redirect } from "next/navigation";
import { auth } from "~/auth";
import { headers } from "next/headers";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return <>{children}</>;
}
```

## Troubleshooting

1. **Session is always null** – ensure `headers` are passed to `auth.api.getSession` on the server and that the request includes cookies.
2. **Client errors** – confirm components using `useSession` are client components and that Better Auth client is initialized via `src/lib/auth/auth-client.ts`.
3. **Role checks failing** – verify the user object includes `role` and that `requireRole` receives the user (not the entire session).

## Best Practices

1. Always derive `session` with `auth.api.getSession({ headers })` on the server (or `getSessionOrThrow` when you want a thrown 401).
2. Keep role checks in services/guards; do not put DB access in client components.
3. Handle `isPending` and `error` states when using `useSession` on the client.
4. Redirect unauthenticated users early in server components/layouts.
5. Import types from `~/auth` to keep user/session typing consistent.
