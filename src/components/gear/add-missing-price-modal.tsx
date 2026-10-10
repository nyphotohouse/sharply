"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { actionAddPublicPriceObservation } from "~/server/pricing/actions";
import type { PriceMarket } from "~/lib/pricing/display-price";
import { useSession } from "~/lib/auth/auth-client";
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

function majorToMinor(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100)
    : null;
}

export function AddMissingPriceModal({
  gearId,
  slug,
  market,
}: {
  gearId: string;
  slug: string;
  market: PriceMarket;
}) {
  const t = useTranslations("gearDetail.usedPriceManagement");
  const router = useRouter();
  const { data, isPending: isSessionPending } = useSession();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    price?: string;
  }>({});

  function resetForm() {
    setAmount("");
    setEvidenceUrl("");
    setNote("");
    setFieldErrors({});
  }

  function handleTrigger() {
    if (!isSessionPending && !data?.session) {
      const callbackUrl = `/gear/${slug}`;
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
      return;
    }
    setOpen(true);
  }

  function validate() {
    const nextErrors: typeof fieldErrors = {};
    if (majorToMinor(amount) === null) {
      nextErrors.price = t("manualObservationInvalid");
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error(nextErrors.price);
      return false;
    }
    return true;
  }

  function submit() {
    if (!validate()) return;
    const pointMinor = majorToMinor(amount);

    startTransition(async () => {
      try {
        await actionAddPublicPriceObservation({
          gearId,
          marketKey: market,
          valueKind: "POINT",
          amountMinor: pointMinor,
          evidenceUrl: evidenceUrl.trim() || null,
          note: note.trim() || null,
        });
        setOpen(false);
        resetForm();
        toast.success(t("contributorPriceSaved"));
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error && error.message === "PRICE_ALREADY_EXISTS"
            ? t("contributorPriceAlreadyExists")
            : t("contributorPriceFailed"),
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-auto cursor-pointer gap-1.5 rounded-md p-1 text-sm font-semibold transition-colors sm:text-base"
        onClick={handleTrigger}
      >
        <span>{t("priceMissing")}</span>
        <span aria-hidden="true">—</span>
        <span className="underline decoration-1 underline-offset-4">
          {t("priceMissingAction")}
        </span>
      </Button>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("contributorPriceTitle")}</DialogTitle>
          <DialogDescription>
            {t("contributorPriceDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="missing-price-amount">{t("price")}</Label>
            <Input
              id="missing-price-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  price: undefined,
                }));
              }}
              placeholder={t("pricePlaceholder")}
              aria-invalid={Boolean(fieldErrors.price)}
            />
            {fieldErrors.price ? (
              <p className="text-destructive text-xs" role="alert">
                {fieldErrors.price}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="missing-price-evidence">
              {t("evidenceUrlOptional")}
            </Label>
            <Input
              id="missing-price-evidence"
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder={t("evidenceUrlPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="missing-price-note">{t("noteOptional")}</Label>
            <Input
              id="missing-price-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="button" disabled={isPending} onClick={submit}>
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {t("addObservation")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
