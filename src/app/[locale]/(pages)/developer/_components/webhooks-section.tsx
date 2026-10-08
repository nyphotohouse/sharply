"use client";

import { Plus, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
  actionDeleteDeveloperWebhookTarget,
  actionSetDeveloperWebhookTargetEnabled,
} from "~/server/developer-api/actions";
import { WebhookCreateDialog } from "./webhook-create-dialog";
import { WebhookTargetList } from "./webhook-target-list";
import type { WebhookTarget } from "./webhook-types";

export function WebhooksSection({
  targetLimit,
  eventTypes,
  targets,
}: {
  targetLimit: number;
  eventTypes: readonly string[];
  targets: WebhookTarget[];
}) {
  const t = useTranslations("developerApi.portal");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTarget(target: WebhookTarget) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await actionSetDeveloperWebhookTargetEnabled(
          target.id,
          !target.isEnabled,
        );
        if (!result.ok) setError(t("actionFailed"));
        else router.refresh();
      } catch {
        setError(t("actionFailed"));
      }
    });
  }

  function deleteTarget(targetId: string) {
    if (!window.confirm(t("webhooks.deleteConfirm"))) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await actionDeleteDeveloperWebhookTarget(targetId);
        if (!result.ok) setError(t("actionFailed"));
        else router.refresh();
      } catch {
        setError(t("actionFailed"));
      }
    });
  }

  return (
    <section className="mt-3 border-y">
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            {t("webhooks.title")}
          </h2>
          <span className="text-muted-foreground text-sm">
            {t("webhooks.eventCount", { count: eventTypes.length })}
          </span>
        </div>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={targets.length >= targetLimit}
        >
          <Plus className="size-4" />
          {t("webhooks.add")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-y py-4">
        <p className="text-muted-foreground text-sm">
          {t("webhooks.targetAllowance", {
            active: targets.length,
            count: targetLimit,
          })}
        </p>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldCheck className="text-primary size-4" aria-hidden="true" />
          {t("webhooks.deliveryNote")}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-destructive border-b py-3 text-sm">
          {error}
        </p>
      ) : null}

      <WebhookTargetList
        targets={targets}
        isPending={isPending}
        onToggle={toggleTarget}
        onDelete={deleteTarget}
      />
      <WebhookCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        targetLimit={targetLimit}
        eventTypes={eventTypes}
      />
    </section>
  );
}
