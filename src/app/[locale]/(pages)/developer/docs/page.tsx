import { ArrowLeft, BookOpen, KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "~/auth";
import { Button } from "~/components/ui/button";
import type { Locale } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";
import { DeveloperApiError } from "~/server/developer-api/errors";
import { getDeveloperApiSpecsCatalog } from "~/server/developer-api/specs";
import { requireDeveloperPortalUser } from "~/server/developer-api/service";
import { RequestExampleTabs } from "./request-example-tabs";
import { SpecSelectorDialog } from "./spec-selector-dialog";

export const dynamic = "force-dynamic";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted/40 mt-4 overflow-x-auto px-4 py-4 font-mono text-sm leading-6">
      <code>{children}</code>
    </pre>
  );
}

function ParameterRow({
  name,
  requirement,
  description,
}: {
  name: string;
  requirement: string;
  description: string;
}) {
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="font-mono text-sm font-medium">{name}</code>
        <span className="text-muted-foreground text-xs">{requirement}</span>
      </div>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {description}
      </p>
    </div>
  );
}

export default async function DeveloperDocsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const developerHref = localizePathname("/developer", locale);
  if (!session?.user) {
    redirect(
      `${localizePathname("/auth/signin", locale)}?callbackUrl=${encodeURIComponent(localizePathname("/developer/docs", locale))}`,
    );
  }

  try {
    await requireDeveloperPortalUser();
  } catch (error) {
    if (
      error instanceof DeveloperApiError &&
      error.code === "developer_access_required"
    ) {
      redirect(developerHref);
    }
    throw error;
  }

  const t = await getTranslations({ locale, namespace: "developerApi.docs" });
  const specCatalog = getDeveloperApiSpecsCatalog();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 pt-28 pb-16">
      <section className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="text-primary flex items-center gap-2 text-sm font-medium">
            <BookOpen className="size-4" aria-hidden="true" />
            {t("title")}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {t("introduction")}
          </h1>
        </div>
        <Button variant="ghost" asChild>
          <Link href={developerHref}>
            <ArrowLeft className="size-4" />
            {t("backToPortal")}
          </Link>
        </Button>
      </section>

      <section className="mt-10 border-b pb-5">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("authenticationTitle")}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("authenticationDescription")}
        </p>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("serverOnlyNote")}
        </p>
        <CodeBlock>{`Authorization: Bearer sharply_live_…`}</CodeBlock>
      </section>

      <section className="border-b py-8">
        <div className="flex items-center gap-2">
          <KeyRound className="text-primary size-4" aria-hidden="true" />
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("errorsTitle")}
          </h2>
        </div>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("errorsDescription")}
        </p>
      </section>

      <section className="border-b py-8">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("webhooksTitle")}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("webhooksDescription")}
        </p>
        <h3 className="mt-6 text-lg font-semibold tracking-tight">
          {t("webhookEventTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("webhookEventDescription")}
        </p>
        <h3 className="mt-6 text-lg font-semibold tracking-tight">
          {t("webhookSignatureTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("webhookSignatureDescription")}
        </p>
        <CodeBlock>{`X-Sharply-Event-Id: f3483f3a-c820-4f08-864f-e5f1f6fe3886
X-Sharply-Timestamp: 1791471845
X-Sharply-Signature: v1=<hex digest>

HMAC-SHA256(signing_secret, timestamp + "." + raw_request_body)`}</CodeBlock>
        <h3 className="mt-6 text-lg font-semibold tracking-tight">
          {t("webhookDeliveryTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("webhookDeliveryDescription")}
        </p>
      </section>

      <section className="mt-10 pb-5">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("endpointsTitle")}
        </h2>
      </section>

      <article className="border-b py-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-primary text-sm font-semibold">GET</span>
          <code className="font-mono text-sm">/api/v1/search</code>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {t("searchTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("searchDescription")}
        </p>
        <div className="pl-12">
          <h4 className="mt-6 text-sm font-semibold">{t("parametersTitle")}</h4>
          <div className="mt-2">
            <ParameterRow
              name="q"
              requirement={t("required")}
              description={t("searchQuery")}
            />
            <ParameterRow
              name="page"
              requirement={t("optional")}
              description={t("searchPage")}
            />
            <ParameterRow
              name="limit"
              requirement={t("optional")}
              description={t("searchLimit")}
            />
          </div>
          <h4 className="mt-6 text-sm font-semibold">{t("exampleRequest")}</h4>
          <RequestExampleTabs
            curl={`curl -sS \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://www.sharplyphoto.com/api/v1/search?q=nikon%20z6&page=1&limit=20"`}
            typescript={`const response = await fetch(
  "https://www.sharplyphoto.com/api/v1/search?q=nikon%20z6&page=1&limit=20",
  {
    headers: {
      Authorization: "Bearer " + process.env.SHARPLY_API_KEY,
    },
  },
);

if (!response.ok) throw new Error("Sharply API request failed");

const { data, pagination } = await response.json();`}
          />
          <h4 className="mt-6 text-sm font-semibold">{t("responseTitle")}</h4>
          <CodeBlock>{`{
  "data": [{
    "slug": "nikon-z6-iii",
    "name": "Nikon Z6 III",
    "brandName": "Nikon",
    "gearType": "CAMERA",
    "estimatedUsedPrice": {
      "US": {
        "low": 178300,
        "typical": 178300,
        "high": 178300,
        "asOf": "2026-09-29T19:05:00.000Z",
        "status": "current",
        "sourceCount": 1,
        "observationCount": 1,
        "methodVersion": 1
      }
    },
    "mpbMaxPriceUsdCents": null
  }],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}`}</CodeBlock>
        </div>
      </article>

      <article className="border-b py-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-primary text-sm font-semibold">GET</span>
          <code className="font-mono text-sm">/api/v1/catalog</code>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {t("catalogTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("catalogDescription")}
        </p>
        <div className="pl-12">
          <h4 className="mt-6 text-sm font-semibold">{t("exampleRequest")}</h4>
          <RequestExampleTabs
            curl={`curl -sS \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://www.sharplyphoto.com/api/v1/catalog"`}
            typescript={`const response = await fetch(
  "https://www.sharplyphoto.com/api/v1/catalog",
  {
    headers: {
      Authorization: "Bearer " + process.env.SHARPLY_API_KEY,
    },
  },
);

if (!response.ok) throw new Error("Sharply API request failed");

const catalog = await response.json();`}
          />
          <h4 className="mt-6 text-sm font-semibold">{t("responseTitle")}</h4>
          <CodeBlock>{`{
  "version": "sha256-…",
  "generatedAt": "2026-07-15T15:00:00.000Z",
  "itemCount": 1,
  "data": [{
    "name": "Nikon Z6III",
    "slug": "nikon-z6iii",
    "brandName": "Nikon",
    "gearType": "CAMERA",
    "thumbnailUrl": "https://…",
    "releaseDate": "2024-06-24T00:00:00.000Z",
    "releaseDatePrecision": "DAY",
    "announcedDate": "2024-06-17T00:00:00.000Z",
    "announceDatePrecision": "DAY"
  }]
}`}</CodeBlock>
          <CodeBlock>{`curl -i \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H 'If-None-Match: "sha256-…"' \\
  "https://www.sharplyphoto.com/api/v1/catalog"`}</CodeBlock>
          <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
            {t("catalogConditionalRequest")}
          </p>
        </div>
      </article>

      <article className="border-b py-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-primary text-sm font-semibold">GET</span>
          <code className="font-mono text-sm">
            /api/v1/gear/random-low-completion
          </code>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {t("randomLowCompletionTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("randomLowCompletionDescription")}
        </p>
        <div className="pl-12">
          <h4 className="mt-6 text-sm font-semibold">{t("exampleRequest")}</h4>
          <RequestExampleTabs
            curl={`curl -sS \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://www.sharplyphoto.com/api/v1/gear/random-low-completion"`}
            typescript={`const response = await fetch(
  "https://www.sharplyphoto.com/api/v1/gear/random-low-completion",
  {
    headers: {
      Authorization: "Bearer " + process.env.SHARPLY_API_KEY,
    },
  },
);

if (!response.ok) throw new Error("Sharply API request failed");

const { data } = await response.json();
const randomGearUrl = data.url;`}
          />
          <h4 className="mt-6 text-sm font-semibold">{t("responseTitle")}</h4>
          <CodeBlock>{`{
  "data": {
    "url": "https://www.sharplyphoto.com/gear/nikon-z6iii"
  }
}`}</CodeBlock>
        </div>
      </article>

      <article className="border-b py-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-primary text-sm font-semibold">GET</span>
          <code className="font-mono text-sm">/api/v1/gear/:slug</code>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {t("gearTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("gearDescription")}
        </p>
        <div className="pl-12">
          <h4 className="mt-6 text-sm font-semibold">{t("parametersTitle")}</h4>
          <div className="mt-2">
            <ParameterRow
              name="slug"
              requirement={t("required")}
              description={t("gearSlug")}
            />
          </div>
          <h4 className="mt-6 text-sm font-semibold">{t("exampleRequest")}</h4>
          <RequestExampleTabs
            curl={`curl -sS \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://www.sharplyphoto.com/api/v1/gear/nikon-z6iii"`}
            typescript={`const response = await fetch(
  "https://www.sharplyphoto.com/api/v1/gear/nikon-z6iii",
  {
    headers: {
      Authorization: "Bearer " + process.env.SHARPLY_API_KEY,
    },
  },
);

if (!response.ok) throw new Error("Sharply API request failed");

const { data } = await response.json();`}
          />
          <h4 className="mt-6 text-sm font-semibold">{t("responseTitle")}</h4>
          <CodeBlock>{`{
  "data": {
    "slug": "nikon-z6iii",
    "name": "Nikon Z6III",
    "gearType": "CAMERA",
    "estimatedUsedPrice": {
      "US": {
        "low": 178300,
        "typical": 178300,
        "high": 178300,
        "asOf": "2026-09-29T19:05:00.000Z",
        "status": "current",
        "sourceCount": 1,
        "observationCount": 1,
        "methodVersion": 1
      }
    },
    "mpbMaxPriceUsdCents": null,
    "mounts": [{ "value": "z-nikon", "shortName": "z" }],
    "cameraSpecs": {
      "sensorFormat": {
        "slug": "full-frame",
        "name": "Full-frame",
        "cropFactor": "1.00"
      },
      "resolutionMp": "24.50"
    }
  }
}`}</CodeBlock>
          <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
            {t("gearTaxonomyNote")}
          </p>
        </div>
      </article>

      <article className="border-b py-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-primary text-sm font-semibold">GET</span>
          <code className="font-mono text-sm">/api/v1/gear/:slug/specs</code>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {t("selectedSpecsTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("selectedSpecsDescription")}
        </p>
        <div className="pl-12">
          <h4 className="mt-6 text-sm font-semibold">{t("parametersTitle")}</h4>
          <div className="mt-2">
            <ParameterRow
              name="slug"
              requirement={t("required")}
              description={t("gearSlug")}
            />
            <ParameterRow
              name="fields"
              requirement={t("required")}
              description={t("specFields")}
            />
          </div>
          <SpecSelectorDialog categories={specCatalog} />
          <h4 className="mt-6 text-sm font-semibold">{t("exampleRequest")}</h4>
          <RequestExampleTabs
            curl={`curl -sS \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://www.sharplyphoto.com/api/v1/gear/nikon-z6-iii/specs?fields=camera.sensor"`}
            typescript={`const response = await fetch(
  "https://www.sharplyphoto.com/api/v1/gear/nikon-z6-iii/specs?fields=camera.sensor",
  {
    headers: {
      Authorization: "Bearer " + process.env.SHARPLY_API_KEY,
    },
  },
);

if (!response.ok) throw new Error("Sharply API request failed");

const { data } = await response.json();`}
          />
          <h4 className="mt-6 text-sm font-semibold">{t("responseTitle")}</h4>
          <CodeBlock>{`{
  "data": [{
    "id": "camera.sensor.isoRange",
    "raw": { "min": 100, "max": 51200 },
    "display": "ISO 100–51,200"
  }]
}`}</CodeBlock>
        </div>
      </article>

      <article className="border-b py-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-primary text-sm font-semibold">GET</span>
          <code className="font-mono text-sm">/api/v1/specs</code>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {t("specCatalogTitle")}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {t("specCatalogDescription")}
        </p>
        <div className="pl-12">
          <h4 className="mt-6 text-sm font-semibold">{t("exampleRequest")}</h4>
          <RequestExampleTabs
            curl={`curl -sS \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://www.sharplyphoto.com/api/v1/specs"`}
            typescript={`const response = await fetch(
  "https://www.sharplyphoto.com/api/v1/specs",
  {
    headers: {
      Authorization: "Bearer " + process.env.SHARPLY_API_KEY,
    },
  },
);

if (!response.ok) throw new Error("Sharply API request failed");

const { data } = await response.json();`}
          />
          <h4 className="mt-6 text-sm font-semibold">{t("responseTitle")}</h4>
          <CodeBlock>{`{
  "data": {
    "categories": [{
      "id": "camera.sensor",
      "label": "Camera sensor",
      "fields": [{ "id": "camera.sensor.isoRange", "label": "ISO Range" }]
    }]
  }
}`}</CodeBlock>
        </div>
      </article>
    </main>
  );
}
