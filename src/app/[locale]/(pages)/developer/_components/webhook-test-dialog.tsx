"use client";

import { CheckCircle2, Send, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { actionSendDeveloperWebhookTestEvent } from "~/server/developer-api/actions";
import type { WebhookTarget } from "./webhook-types";

type TestResult =
  | { kind: "success"; statusCode: number }
  | { kind: "http_failure"; statusCode: number }
  | { kind: "network_failure" }
  | { kind: "request_failure" };

export function WebhookTestDialog({
  target,
  onOpenChange,
}: {
  target: WebhookTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("developerApi.portal.webhooks");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);
  const requestId = useRef(0);

  function sendTestEvent() {
    if (!target) return;
    const currentRequestId = ++requestId.current;
    setResult(null);
    startTransition(async () => {
      try {
        const response = await actionSendDeveloperWebhookTestEvent(target.id);
        if (requestId.current !== currentRequestId) return;
        if (!response.ok) {
          setResult({ kind: "request_failure" });
        } else if (response.succeeded && response.statusCode !== null) {
          setResult({ kind: "success", statusCode: response.statusCode });
        } else if (response.statusCode !== null) {
          setResult({ kind: "http_failure", statusCode: response.statusCode });
        } else {
          setResult({ kind: "network_failure" });
        }
      } catch {
        if (requestId.current === currentRequestId) {
          setResult({ kind: "request_failure" });
        }
      }
    });
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      requestId.current += 1;
      setResult(null);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("testDialogTitle")}</DialogTitle>
          <DialogDescription>
            {target
              ? t("testDialogDescription", {
                  endpoint: target.endpointUrl,
                })
              : null}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div
            role={result.kind === "success" ? "status" : "alert"}
            aria-live="polite"
            className={`flex gap-3 rounded-md border p-4 text-sm ${
              result.kind === "success"
                ? "border-primary/40 bg-primary/5"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            {result.kind === "success" ? (
              <CheckCircle2
                className="text-primary mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <XCircle
                className="text-destructive mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            )}
            <div className="space-y-1">
              <p className="font-medium">
                {result.kind === "success"
                  ? t("testSuccessTitle")
                  : result.kind === "http_failure"
                    ? t("testHttpFailureTitle")
                    : result.kind === "network_failure"
                      ? t("testNetworkFailureTitle")
                      : t("testRequestFailureTitle")}
              </p>
              {result.kind === "success" || result.kind === "http_failure" ? (
                <p className="text-muted-foreground">
                  {t("testHttpStatus", { status: result.statusCode })}
                </p>
              ) : result.kind === "network_failure" ? (
                <p className="text-muted-foreground">
                  {t("testNetworkFailureDescription")}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {t("testRequestFailureDescription")}
                </p>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            onClick={sendTestEvent}
            disabled={isPending || !target}
          >
            <Send className="size-4" aria-hidden="true" />
            {isPending ? t("testSending") : t("testSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
