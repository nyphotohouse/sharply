"use client";

import { Pause, Play, Send, Trash2, Webhook } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Button } from "~/components/ui/button";
import type { WebhookTarget } from "./webhook-types";

export function WebhookTargetList({
  targets,
  isPending,
  onToggle,
  onDelete,
  onTest,
}: {
  targets: WebhookTarget[];
  isPending: boolean;
  onToggle: (target: WebhookTarget) => void;
  onDelete: (targetId: string) => void;
  onTest: (target: WebhookTarget) => void;
}) {
  const t = useTranslations("developerApi.portal.webhooks");
  const locale = useLocale();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    [locale],
  );

  if (targets.length === 0) {
    return <p className="text-muted-foreground py-6 text-sm">{t("empty")}</p>;
  }

  return (
    <div>
      {targets.map((target) => (
        <article
          key={target.id}
          className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b py-5 last:border-b-0"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <Webhook className="text-primary size-4" aria-hidden="true" />
              <span className="font-mono text-sm break-all">
                {target.endpointUrl}
              </span>
              <span className="rounded-full border px-2 py-0.5 text-xs font-normal">
                {target.isEnabled ? t("status.active") : t("status.paused")}
              </span>
            </div>
            <p className="text-muted-foreground mt-2 font-mono text-xs">
              {target.eventType}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("created", {
                date: dateFormatter.format(new Date(target.createdAt)),
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => onTest(target)}
            >
              <Send className="size-4" aria-hidden="true" />
              {t("testButton")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => onToggle(target)}
            >
              {target.isEnabled ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              {target.isEnabled ? t("pause") : t("resume")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => onDelete(target.id)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t("delete")}
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
