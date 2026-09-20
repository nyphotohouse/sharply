import { withPayload } from "@payloadcms/next/withPayload";
import { withSentryConfig } from "@sentry/nextjs/config";
import { withBotId } from "botid/next/config";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";
/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

const emptyNodeFsPromisesPath = fileURLToPath(
  new URL("./src/lib/empty-node-fs-promises.js", import.meta.url),
);
const outputFileTracingRoot = fileURLToPath(new URL("./", import.meta.url));
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import("next").NextConfig} */
const config = {
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server/api/auth",
        destination: "/api/auth/metadata/oauth-authorization-server",
      },
      {
        source: "/api/auth/.well-known/openid-configuration",
        destination: "/api/auth/metadata/openid-configuration",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/gear",
        destination: "/browse",
        permanent: true,
      },
      {
        source: "/gear/",
        destination: "/browse",
        permanent: true,
      },
      {
        source: "/brand/:slug",
        destination: "/browse/:slug",
        permanent: true,
      },
      {
        source: "/discord/invite",
        destination: "https://discord.gg/8qSXVurbw6",
        permanent: false,
      },
      {
        source: "/qr",
        destination: "/",
        permanent: false,
      },
    ];
  },
  images: {
    unoptimized: process.env.NODE_ENV === "development",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "8v5lpkd4bi.ufs.sh",
      },
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "8ohygcz3uqpkb9ee.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  outputFileTracingRoot,
  // sharp is auto-externalized by Next.js. Its native binding loads libvips at
  // runtime, so explicitly include the Linux artifacts in every Vercel route
  // trace instead of relying on static import analysis to find them.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:fs\/promises$/,
          emptyNodeFsPromisesPath,
        ),
      );
    }

    return config;
  },
};

const configuredApp = withBotId(withPayload(withNextIntl(config)));
const sentryEnabled = Boolean(
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
);

export default sentryEnabled
  ? withSentryConfig(configuredApp, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      silent: true,
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
      },
    })
  : configuredApp;
