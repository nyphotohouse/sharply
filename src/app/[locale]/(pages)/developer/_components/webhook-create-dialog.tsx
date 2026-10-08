"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { actionCreateDeveloperWebhookTarget } from "~/server/developer-api/actions";
import { WebhookSigningSecretDialog } from "./webhook-signing-secret-dialog";

export function WebhookCreateDialog({
  open,
  onOpenChange,
  targetLimit,
  eventTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetLimit: number;
  eventTypes: readonly string[];
}) {
  const t = useTranslations("developerApi.portal");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [endpointUrl, setEndpointUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);

  function createTarget(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await actionCreateDeveloperWebhookTarget(formData);
        if (!result.ok) {
          setError(
            result.code === "target_limit_reached"
              ? t("webhooks.limitReached", { count: targetLimit })
              : result.code === "invalid_request"
                ? t("webhooks.invalidEndpoint")
                : t("actionFailed"),
          );
          return;
        }
        setEndpointUrl("");
        onOpenChange(false);
        setSigningSecret(result.secret);
        router.refresh();
      } catch {
        setError(t("actionFailed"));
      }
    });
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("webhooks.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("webhooks.createDescription")}
            </DialogDescription>
          </DialogHeader>
          <form action={createTarget} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="developer-webhook-url">
                {t("webhooks.endpointUrl")}
              </Label>
              <Input
                id="developer-webhook-url"
                name="endpointUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={endpointUrl}
                onChange={(event) => setEndpointUrl(event.target.value)}
                required
                maxLength={2048}
                placeholder={t("webhooks.endpointPlaceholder")}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("webhooks.eventsTitle")}
              </legend>
              {eventTypes.map((eventType) => (
                <label
                  key={eventType}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                >
                  <input
                    className="accent-primary mt-1 size-4"
                    type="radio"
                    name="eventType"
                    value={eventType}
                    defaultChecked
                    required
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-sm">{eventType}</span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {t("webhooks.gearCreatedDescription")}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={isPending}>
              <Plus className="size-4" />
              {t("webhooks.create")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <WebhookSigningSecretDialog
        secret={signingSecret}
        onClose={() => setSigningSecret(null)}
      />
    </>
  );
}
