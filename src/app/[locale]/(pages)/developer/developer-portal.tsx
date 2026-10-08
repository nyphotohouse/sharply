"use client";

import {
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { Locale } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";
import {
  actionCreateDeveloperApiKey,
  actionRevokeDeveloperApiKey,
} from "~/server/developer-api/actions";
import { WebhooksSection } from "./_components/webhooks-section";
import type { WebhookTarget } from "./_components/webhook-types";

type PortalKey = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
  usage: { today: number; last30Days: number };
};

export function DeveloperPortal({
  data,
}: {
  data: {
    userName: string;
    keyLimit: number;
    rateLimit: number;
    keys: PortalKey[];
    webhookTargetLimit: number;
    webhookEventTypes: readonly string[];
    webhookTargets: WebhookTarget[];
  };
}) {
  const t = useTranslations("developerApi");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [secret, setSecret] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const activeKeyCount = data.keys.length;
  const documentationHref = localizePathname("/developer/docs", locale);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    [locale],
  );

  function createKey(formData: FormData) {
    setError(null);
    startTransition(() => {
      void actionCreateDeveloperApiKey(formData).then((result) => {
        if (!result.ok) {
          setError(t("portal.actionFailed"));
          return;
        }
        setKeyName("");
        setSecret(result.secret);
        setCreateDialogOpen(false);
        router.refresh();
      });
    });
  }

  function revokeKey(keyId: string) {
    if (!window.confirm(t("portal.revokeConfirm"))) return;
    setError(null);
    startTransition(() => {
      void actionRevokeDeveloperApiKey(keyId).then((result) => {
        if (!result.ok) setError(t("portal.actionFailed"));
        else router.refresh();
      });
    });
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 pt-28 pb-16">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <SquareTerminal className="text-primary size-7" aria-hidden="true" />
          {t("portal.welcome", { name: data.userName })}
        </h1>
        <Button type="button" variant="outline" asChild>
          <Link href={documentationHref}>{t("docs.link")}</Link>
        </Button>
      </section>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-4 border-y py-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          {t("portal.title")}
        </h2>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldCheck className="text-primary size-4" />
          <span>{t("portal.rateLimit", { count: data.rateLimit })}</span>
        </div>
      </section>

      <section className="py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {t("portal.keyAllowance", {
              count: data.keyLimit,
              active: activeKeyCount,
            })}
          </p>
          <Button type="button" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" />
            {t("portal.create")}
          </Button>
        </div>

        <div className="mt-6 border-t">
          {data.keys.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">
              {t("portal.emptyKeys")}
            </p>
          ) : (
            data.keys.map((key) => (
              <article
                key={key.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b py-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    <KeyRound className="text-primary size-4" />
                    <span>{key.name}</span>
                  </div>
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {key.keyPrefix}…
                  </p>
                  <p className="text-muted-foreground mt-3 text-xs">
                    {t("portal.usage", {
                      today: key.usage.today,
                      total: key.usage.last30Days,
                    })}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("portal.activity", {
                      created: dateFormatter.format(new Date(key.createdAt)),
                      lastUsed: key.lastUsedAt
                        ? dateFormatter.format(new Date(key.lastUsedAt))
                        : t("portal.never"),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => revokeKey(key.id)}
                >
                  <Trash2 className="size-4" />
                  {t("portal.revoke")}
                </Button>
              </article>
            ))
          )}
        </div>
      </section>

      <WebhooksSection
        targetLimit={data.webhookTargetLimit}
        eventTypes={data.webhookEventTypes}
        targets={data.webhookTargets}
      />

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("portal.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("portal.keyAllowance", {
                count: data.keyLimit,
                active: activeKeyCount,
              })}
            </DialogDescription>
          </DialogHeader>
          <form action={createKey} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="developer-key-name">{t("portal.keyName")}</Label>
              <Input
                id="developer-key-name"
                name="name"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                required
                maxLength={100}
                placeholder={t("portal.keyNamePlaceholder")}
              />
            </div>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={isPending || activeKeyCount >= data.keyLimit}
            >
              <Plus className="size-4" />
              {t("portal.create")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(secret)}
        onOpenChange={(open) => {
          if (!open) {
            setSecret(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("portal.secretTitle")}</DialogTitle>
            <DialogDescription>
              {t("portal.secretDescription")}
            </DialogDescription>
          </DialogHeader>
          {secret ? (
            <div className="space-y-4">
              <code className="block border-y py-4 font-mono text-sm break-all">
                {secret}
              </code>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copySecret()}
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? t("portal.copied") : t("portal.copy")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSecret(null);
                    setCopied(false);
                  }}
                >
                  {t("portal.dismiss")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
