import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import {
  betterAuth,
  type Auth as BetterAuthInstance,
  type BetterAuthOptions,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, jwt } from "better-auth/plugins";
import { authAdditionalFields } from "~/lib/auth/additional-fields";
import { getResend } from "~/lib/email";
import { resolveAuthOriginConfig } from "~/server/auth/auth-origin-config";
import {
  canManageOAuthClients,
  SHARPLY_OAUTH_CONSENT_PAGE,
  SHARPLY_OAUTH_LOGIN_PAGE,
  SHARPLY_OIDC_SCOPES,
} from "~/server/auth/oauth-provider-config";
import {
  getInitialDiscordAvatarData,
  mapDiscordProfileToUser,
} from "~/server/auth/discord-profile";
import { db } from "~/server/db"; // your drizzle instance
import * as schema from "~/server/db/schema";
import { dispatchUserSignupNotification } from "~/server/discord-logs/user-signup";

function createAuthOptions() {
  const resend = getResend();
  const emailOtpEnabled =
    !!resend && !!process.env.RESEND_API_KEY && !!process.env.RESEND_EMAIL_FROM;
  const authOriginConfig = resolveAuthOriginConfig(process.env);

  if (authOriginConfig.warning) {
    console.warn(authOriginConfig.warning);
  }

  const options = {
    // config
    appName: "Sharply",
    ...(authOriginConfig.staticAuthBaseURL
      ? { baseURL: authOriginConfig.staticAuthBaseURL }
      : {}),
    trustedOrigins: authOriginConfig.trustedOrigins,
    secret: process.env.AUTH_SECRET!,
    disabledPaths: ["/token"],

    // database adapter
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        ...schema,
        user: schema.users,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
        passkey: schema.passkeys,
        jwks: schema.authJwks,
        oauthClient: schema.oauthClients,
        oauthRefreshToken: schema.oauthRefreshTokens,
        oauthAccessToken: schema.oauthAccessTokens,
        oauthConsent: schema.oauthConsents,
      },
    }),

    // providers
    emailAndPassword: {
      enabled: false,
    },
    socialProviders: {
      google: {
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      },
      discord: {
        clientId: process.env.AUTH_DISCORD_ID!,
        clientSecret: process.env.AUTH_DISCORD_SECRET!,
        mapProfileToUser: mapDiscordProfileToUser,
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "discord"],
        allowDifferentEmails: true,
      },
    },

    session: {
      storeSessionInDatabase: true,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "compact",
      },
    },

    user: {
      modelName: "user",
      additionalFields: authAdditionalFields.user,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const avatarData = getInitialDiscordAvatarData(user.image);
            if (!avatarData) return;

            return {
              data: {
                ...user,
                ...avatarData,
              },
            };
          },
          after: async (user, context) => {
            dispatchUserSignupNotification({
              authContext: context,
              name: user.name,
            });
          },
        },
      },
    },
    plugins: [
      nextCookies(),
      passkey(),
      jwt(),
      oauthProvider({
        loginPage: SHARPLY_OAUTH_LOGIN_PAGE,
        consentPage: SHARPLY_OAUTH_CONSENT_PAGE,
        scopes: [...SHARPLY_OIDC_SCOPES],
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
        clientPrivileges: ({ user }) => canManageOAuthClients(user),
      }),
      ...(emailOtpEnabled
        ? [
            emailOTP({
              overrideDefaultEmailVerification: true,
              async sendVerificationOTP({ email, otp, type }) {
                const emailClient = getResend();
                const subject =
                  type === "sign-in"
                    ? "Your Sharply sign-in code"
                    : type === "email-verification"
                      ? "Verify your Sharply email"
                      : "Reset your Sharply password";
                const text = `Your code is ${otp}. It expires in 10 minutes. If you didn’t request this, please ignore.`;
                await emailClient!.emails.send({
                  from: process.env.RESEND_EMAIL_FROM!,
                  to: email,
                  subject,
                  text,
                });
              },
            }),
          ]
        : []),
    ],
  } satisfies BetterAuthOptions;

  return options;
}

type AuthOptions = ReturnType<typeof createAuthOptions>;
type AuthInstance = BetterAuthInstance<AuthOptions>;

function createAuth(): AuthInstance {
  return betterAuth(createAuthOptions());
}

let authInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (!authInstance) {
    authInstance = createAuth();
  }

  return authInstance;
}

export const auth: AuthInstance = new Proxy({} as AuthInstance, {
  has(_target, prop) {
    return prop in getAuth();
  },
  get(_target, prop) {
    const instance = getAuth();
    const value = instance[prop as keyof AuthInstance];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

// auth types
// TODO: replace any user type imports from schema with this and remove the old export from schema (just moving it here)
export type AuthSession = AuthInstance["$Infer"]["Session"];
export type AuthUser = AuthSession["user"];
export type { UserRole } from "~/lib/auth/additional-fields";
