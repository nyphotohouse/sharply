"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export function WebhookSigningSecretDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("developerApi.portal");
  const [copied, setCopied] = useState(false);

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  return (
    <Dialog
      open={Boolean(secret)}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("webhooks.secretTitle")}</DialogTitle>
          <DialogDescription>
            {t("webhooks.secretDescription")}
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
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                {copied ? t("copied") : t("copy")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCopied(false);
                  onClose();
                }}
              >
                {t("dismiss")}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
