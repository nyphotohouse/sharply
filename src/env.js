import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_DISCORD_ID:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_DISCORD_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_GOOGLE_ID:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_GOOGLE_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_BASE_URL: z.string().url().optional(),
    AUTH_ADDITIONAL_TRUSTED_ORIGINS: z.string().optional(),
    BETTER_AUTH_BASE_URL: z.string().url().optional(),
    BETTER_AUTH_URL: z.string().url().optional(),
    DATABASE_URL: z.string().url(),
    CRON_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    DISCORD_ROLLUP_WEBHOOK_URL:
      process.env.NODE_ENV === "production"
        ? z.string().url()
        : z.string().url().optional(),
    DISCORD_CHANGE_REQUEST_WEBHOOK_URL: z.string().url().optional(),
    DISCORD_GENERAL_LOGS_WEBHOOK_URL: z.string().url().optional(),
    DISCORD_BOT_INTERNAL_API_TOKEN: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    GEAR_IMAGE_REVIEW_MODEL: z.string().optional(),
    PAYLOAD_SECRET: z.string(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    BLOB_STORE_ID: z.string().optional(),
    BLOB_WEBHOOK_PUBLIC_KEY: z.string().optional(),
    ENABLE_VERCEL_SPEED_INSIGHTS: z.enum(["true", "false"]).optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_EMAIL_FROM: z.string().email().optional(),
    RESEND_EMAIL_CONTACT: z.string().email().optional(),
    DEV_AUTH: z.enum(["true", "false"]).optional(),
    DEV_AUTH_EMAIL: z.string().email().optional(),
    DEV_AUTH_LOCALHOST_ONLY: z.enum(["true", "false"]).optional(),
    DEV_AUTH_PREVIEW: z.enum(["true", "false"]).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    UPLOADTHING_TOKEN:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AMAZON_AFFILIATE_TAG: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
    NEXT_PUBLIC_BASE_URL: z.string().url(),
    NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js proxy runtime or
   * client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID,
    AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_BASE_URL: process.env.AUTH_BASE_URL,
    AUTH_ADDITIONAL_TRUSTED_ORIGINS:
      process.env.AUTH_ADDITIONAL_TRUSTED_ORIGINS,
    BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    DISCORD_ROLLUP_WEBHOOK_URL: process.env.DISCORD_ROLLUP_WEBHOOK_URL,
    DISCORD_CHANGE_REQUEST_WEBHOOK_URL:
      process.env.DISCORD_CHANGE_REQUEST_WEBHOOK_URL,
    DISCORD_GENERAL_LOGS_WEBHOOK_URL:
      process.env.DISCORD_GENERAL_LOGS_WEBHOOK_URL,
    DISCORD_BOT_INTERNAL_API_TOKEN: process.env.DISCORD_BOT_INTERNAL_API_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GEAR_IMAGE_REVIEW_MODEL: process.env.GEAR_IMAGE_REVIEW_MODEL,
    NODE_ENV: process.env.NODE_ENV,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    BLOB_WEBHOOK_PUBLIC_KEY: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
    ENABLE_VERCEL_SPEED_INSIGHTS: process.env.ENABLE_VERCEL_SPEED_INSIGHTS,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_EMAIL_FROM: process.env.RESEND_EMAIL_FROM,
    RESEND_EMAIL_CONTACT: process.env.RESEND_EMAIL_CONTACT,
    DEV_AUTH: process.env.DEV_AUTH,
    DEV_AUTH_EMAIL: process.env.DEV_AUTH_EMAIL,
    DEV_AUTH_LOCALHOST_ONLY: process.env.DEV_AUTH_LOCALHOST_ONLY,
    DEV_AUTH_PREVIEW: process.env.DEV_AUTH_PREVIEW,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    AMAZON_AFFILIATE_TAG: process.env.AMAZON_AFFILIATE_TAG,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    SENTRY_RELEASE: process.env.SENTRY_RELEASE,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
