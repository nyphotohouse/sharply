"use client";

import {
  BadgeDollarSign,
  Pencil,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  actionAddManualPriceObservation,
  actionArchiveOrDeletePriceMapping,
  actionCreatePriceMapping,
  actionRecalculateGearPricing,
  actionRefreshPriceMapping,
  actionRestorePriceMapping,
  actionUpdatePriceMappingLink,
} from "~/server/pricing/actions";
import { fetchJson } from "~/lib/fetch-json";
import { formatPriceSourceLabel } from "~/lib/pricing/source-label";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

type SerializedObservation = {
  id: string;
  valueKind: "POINT" | "RANGE";
  amountMinor: number | null;
  lowMinor: number | null;
  highMinor: number | null;
  currency: string;
  condition: string;
  availability: string;
  observedAt: string;
  evidenceUrl: string | null;
  note: string | null;
};

type SerializedMapping = {
  id: string;
  sourceKey: string;
  marketKey: string;
  priceKind: string;
  canonicalUrl: string | null;
  fetchUrl: string | null;
  status: "ACTIVE" | "DISABLED";
  lastFetchedAt: string | null;
  lastFetchStatus: "NEVER" | "SUCCESS" | "NO_DATA" | "ERROR";
  nextFetchAt: string | null;
  observations: SerializedObservation[];
};

type PriceManagementResponse = {
  gear: {
    id: string;
    name: string;
    slug: string;
    usedPriceProjection: Record<
      string,
      {
        low: number;
        typical: number;
        high: number;
        asOf: string;
        status: "current" | "stale" | "unavailable";
        sourceCount: number;
        observationCount: number;
        methodVersion: number;
      }
    > | null;
  };
  mappings: SerializedMapping[];
  estimates: Array<{
    id: string;
    marketKey: string;
    priceKind: string;
    lowMinor: number;
    typicalMinor: number;
    highMinor: number;
    currency: string;
    asOf: string;
    sourceCount: number;
    observationCount: number;
  }>;
};

const SOURCE_OPTIONS = [
  ["manual", "Manual"],
  ["mpb", "MPB"],
  ["kamerastore", "KameraStore"],
] as const;

const MARKET_OPTIONS = [
  ["US", "US · USD"],
  ["UK", "UK · GBP"],
  ["EU", "EU · EUR"],
] as const;

function formatMinor(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function mappingPriceKey(
  mapping: Pick<SerializedMapping, "marketKey" | "priceKind">,
) {
  return mapping.priceKind === "used_retail"
    ? mapping.marketKey
    : `${mapping.marketKey}:${mapping.priceKind}`;
}

function CreatePriceMappingModal({
  gearId,
  mappings,
  onCreated,
}: {
  gearId: string;
  mappings: SerializedMapping[];
  onCreated: (mappingId: string, sourceKey: string) => Promise<void>;
}) {
  const t = useTranslations("gearDetail.usedPriceManagement");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sourceKey, setSourceKey] = useState("manual");
  const [marketKey, setMarketKey] = useState("US");
  const [mappingUrl, setMappingUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    market?: string;
    mappingUrl?: string;
  }>({});
  const isAutomatic = sourceKey !== "manual";
  const hasExistingMapping = (source: string, market: string) =>
    mappings.some(
      (mapping) => mapping.sourceKey === source && mapping.marketKey === market,
    );
  const isDuplicate = hasExistingMapping(sourceKey, marketKey);

  function validateMapping() {
    const nextErrors: typeof fieldErrors = {};

    if (isDuplicate) {
      nextErrors.market = t("mappingAlreadyExists");
    }

    const value = mappingUrl.trim();
    if (isAutomatic && !value) {
      nextErrors.mappingUrl = t("requiredLinkHelp");
    } else if (value) {
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error();
        }
      } catch {
        nextErrors.mappingUrl = t("invalidProductLink");
      }
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.error(
        nextErrors.mappingUrl ?? nextErrors.market ?? t("invalidMapping"),
      );
      return false;
    }

    return true;
  }

  function createMapping() {
    if (!validateMapping()) return;

    startTransition(async () => {
      try {
        const mapping = await actionCreatePriceMapping({
          gearId,
          sourceKey,
          marketKey,
          canonicalUrl: mappingUrl.trim() || null,
          fetchUrl: mappingUrl.trim() || null,
        });
        await onCreated(mapping.id, mapping.sourceKey);
        setMappingUrl("");
        setOpen(false);
        toast.success("Price mapping saved");
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Add Price Source</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Price Source</DialogTitle>
          <DialogDescription>
            Choose a market and connect the source you want to track.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="price-source">Source</Label>
            <Select
              value={sourceKey}
              onValueChange={(value) => {
                setSourceKey(value);
                setFieldErrors((current) => ({
                  ...current,
                  market: undefined,
                  mappingUrl: undefined,
                }));
              }}
            >
              <SelectTrigger id="price-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map(([value, label]) => (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={MARKET_OPTIONS.every(([market]) =>
                      hasExistingMapping(value, market),
                    )}
                  >
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="price-market">Market</Label>
            <Select
              value={marketKey}
              onValueChange={(value) => {
                setMarketKey(value);
                setFieldErrors((current) => ({
                  ...current,
                  market: undefined,
                }));
              }}
            >
              <SelectTrigger
                id="price-market"
                className="w-full"
                aria-invalid={Boolean(fieldErrors.market)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKET_OPTIONS.map(([value, label]) => (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={hasExistingMapping(sourceKey, value)}
                  >
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.market ? (
              <p className="text-destructive text-xs" role="alert">
                {fieldErrors.market}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="price-source-url">
              Product link{isAutomatic ? " *" : ""}
            </Label>
            <Input
              id="price-source-url"
              type="url"
              required={isAutomatic}
              aria-required={isAutomatic}
              value={mappingUrl}
              onChange={(event) => {
                setMappingUrl(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  mappingUrl: undefined,
                }));
              }}
              aria-invalid={Boolean(fieldErrors.mappingUrl)}
              placeholder={
                isAutomatic
                  ? "Required source product URL"
                  : "Source product URL (optional)"
              }
            />
            {fieldErrors.mappingUrl ? (
              <p className="text-destructive text-xs" role="alert">
                {fieldErrors.mappingUrl}
              </p>
            ) : isAutomatic && !mappingUrl.trim() ? (
              <p className="text-muted-foreground text-xs">
                {t("requiredLinkHelp")}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              aria-busy={isPending}
              disabled={isPending}
              onClick={createMapping}
            >
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Add Price Source
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditPriceMappingLinkModal({
  mapping,
  slug,
  disabled,
  onSaved,
}: {
  mapping: SerializedMapping;
  slug: string;
  disabled?: boolean;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("gearDetail.usedPriceManagement");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mappingUrl, setMappingUrl] = useState(
    mapping.fetchUrl ?? mapping.canonicalUrl ?? "",
  );
  const isAutomatic = mapping.sourceKey !== "manual";

  useEffect(() => {
    if (open) {
      setMappingUrl(mapping.fetchUrl ?? mapping.canonicalUrl ?? "");
    }
  }, [mapping.canonicalUrl, mapping.fetchUrl, open]);

  function saveLink() {
    if (isAutomatic && !mappingUrl.trim()) return;

    startTransition(async () => {
      try {
        await actionUpdatePriceMappingLink(
          mapping.id,
          slug,
          mappingUrl.trim() || null,
        );
        await onSaved();
        setOpen(false);
        toast.success(t("linkSaved"));
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("editLink")}
          disabled={disabled || isPending}
        >
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editLinkTitle")}</DialogTitle>
          <DialogDescription>{t("editLinkDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={"edit-price-source-url-" + mapping.id}>
              {t("productLink")}
              {isAutomatic ? " *" : ""}
            </Label>
            <Input
              id={"edit-price-source-url-" + mapping.id}
              type="url"
              required={isAutomatic}
              aria-required={isAutomatic}
              value={mappingUrl}
              onChange={(event) => setMappingUrl(event.target.value)}
              placeholder={t("productLinkPlaceholder")}
            />
            {isAutomatic && !mappingUrl.trim() ? (
              <p className="text-muted-foreground text-xs">
                {t("requiredLinkHelp")}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={isPending || (isAutomatic && !mappingUrl.trim())}
              onClick={saveLink}
            >
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {t("saveLink")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ManagePriceModal({
  gearId,
  slug,
  trigger,
}: {
  gearId: string;
  slug?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("gearDetail.usedPriceManagement");
  const [valueKind, setValueKind] = useState<"POINT" | "RANGE">("POINT");
  const [amount, setAmount] = useState("");
  const [lowAmount, setLowAmount] = useState("");
  const [highAmount, setHighAmount] = useState("");
  const [observedDate, setObservedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [initialFetchIds, setInitialFetchIds] = useState<string[]>([]);

  const { data, error, isLoading, mutate } = useSWR<PriceManagementResponse>(
    open ? `/api/admin/pricing/gear/${encodeURIComponent(gearId)}` : null,
    (url: string) => fetchJson<PriceManagementResponse>(url),
    { revalidateOnFocus: false },
  );

  const activeMappings = useMemo(
    () => data?.mappings.filter((mapping) => mapping.status === "ACTIVE") ?? [],
    [data?.mappings],
  );
  const archivedMappings = useMemo(
    () =>
      data?.mappings.filter((mapping) => mapping.status === "DISABLED") ?? [],
    [data?.mappings],
  );
  const estimatesByKey = useMemo(
    () =>
      new Map(
        (data?.estimates ?? []).map((estimate) => [
          mappingPriceKey(estimate),
          estimate,
        ]),
      ),
    [data?.estimates],
  );

  function runMutation(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task();
        await mutate();
      } catch (mutationError) {
        toast.error(errorMessage(mutationError));
      }
    });
  }

  function addObservation(mappingId: string) {
    const majorToMinor = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0
        ? Math.round(parsed * 100)
        : null;
    };
    const payload = {
      mappingId,
      valueKind,
      amountMinor: valueKind === "POINT" ? majorToMinor(amount) : null,
      lowMinor: valueKind === "RANGE" ? majorToMinor(lowAmount) : null,
      highMinor: valueKind === "RANGE" ? majorToMinor(highAmount) : null,
      observedAt: new Date(`${observedDate}T12:00:00Z`),
      evidenceUrl: evidenceUrl || null,
      note: note || null,
    };
    runMutation(async () => {
      await actionAddManualPriceObservation(payload);
      setAmount("");
      setLowAmount("");
      setHighAmount("");
      setEvidenceUrl("");
      setNote("");
      toast.success("Observation added and projection recalculated");
    });
  }

  function refreshMapping(mappingId: string) {
    runMutation(async () => {
      const result = await actionRefreshPriceMapping(
        mappingId,
        slug ?? data?.gear.slug ?? "",
      );
      if (!result.ok) {
        toast.info(`Refresh available after ${formatDate(result.retryAt)}`);
        return;
      }
      toast.success(
        result.insertedObservationCount > 0
          ? "Source refreshed and projection recalculated"
          : "Source refreshed with no new price data",
      );
    });
  }

  function disableMapping(mappingId: string) {
    if (!slug) return;
    runMutation(async () => {
      const result = await actionArchiveOrDeletePriceMapping(mappingId, slug);
      toast.success(
        result.action === "deleted"
          ? "Price mapping deleted"
          : "Price mapping archived",
      );
    });
  }

  function restoreMapping(mappingId: string) {
    if (!slug) return;
    runMutation(async () => {
      await actionRestorePriceMapping(mappingId, slug);
      toast.success("Price mapping restored");
    });
  }

  function recalculate() {
    if (!slug) return;
    runMutation(async () => {
      await actionRecalculateGearPricing(gearId, slug);
      toast.success("Projection recalculated");
    });
  }

  async function handleMappingCreated(mappingId: string, sourceKey: string) {
    const shouldFetchImmediately = sourceKey !== "manual";
    if (shouldFetchImmediately) {
      setInitialFetchIds((current) => [...current, mappingId]);
    }
    await mutate();

    if (!shouldFetchImmediately) return;

    startTransition(async () => {
      try {
        await actionRefreshPriceMapping(
          mappingId,
          slug ?? data?.gear.slug ?? "",
        );
        await mutate();
      } catch (fetchError) {
        toast.error(errorMessage(fetchError));
      } finally {
        setInitialFetchIds((current) =>
          current.filter((currentId) => currentId !== mappingId),
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Used Price Management</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-[20rem] items-center justify-center">
            <LoaderCircle
              className="text-muted-foreground size-6 animate-spin"
              aria-label="Loading pricing data"
            />
            <span className="sr-only">Loading pricing data…</span>
          </div>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm">{errorMessage(error)}</p>
        ) : null}

        {data ? (
          <div className="animate-in fade-in space-y-6 duration-300">
            {activeMappings.length === 0 ? (
              <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
                <h3 className="text-base font-semibold">No Mappings</h3>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                  Add a price source to start tracking prices for this item.
                </p>
                <div className="mt-4">
                  <CreatePriceMappingModal
                    gearId={gearId}
                    mappings={data.mappings}
                    onCreated={handleMappingCreated}
                  />
                </div>
              </div>
            ) : null}

            {data.mappings.length > 0 ? (
              <section
                aria-labelledby="current-projection-title"
                className="rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="current-projection-title" className="font-medium">
                      {t("currentProjection")}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("currentProjectionDescription")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending || !data}
                    onClick={recalculate}
                  >
                    <RotateCcw className="size-4" />
                    {t("recalculate")}
                  </Button>
                </div>
                {data.estimates.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {data.estimates.map((estimate) => (
                      <div
                        key={estimate.id}
                        className="bg-muted/20 rounded-md p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {estimate.marketKey}
                          </span>
                          <Badge variant="outline">{estimate.currency}</Badge>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="mt-2 text-lg font-semibold">
                              {formatMinor(
                                estimate.typicalMinor,
                                estimate.currency,
                              )}
                            </p>
                            {estimate.lowMinor !== estimate.highMinor ? (
                              <p className="text-muted-foreground text-xs">
                                {formatMinor(
                                  estimate.lowMinor,
                                  estimate.currency,
                                )}{" "}
                                –{" "}
                                {formatMinor(
                                  estimate.highMinor,
                                  estimate.currency,
                                )}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground text-xs sm:text-right">
                            {estimate.observationCount} {t("observations")}
                          </p>
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {t("asOf", { date: formatDate(estimate.asOf) })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-4 text-sm">
                    {t("noProjection")}
                  </p>
                )}
              </section>
            ) : null}

            {activeMappings.length > 0 ? (
              <div className="space-y-3">
                {activeMappings.map((mapping) => {
                  const estimate = estimatesByKey.get(mappingPriceKey(mapping));
                  const projection =
                    data.gear.usedPriceProjection?.[mappingPriceKey(mapping)];
                  const isManual = mapping.sourceKey === "manual";
                  const isInitialFetching = initialFetchIds.includes(
                    mapping.id,
                  );

                  return (
                    <div
                      key={mapping.id}
                      className="space-y-4 rounded-lg border p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <span className="font-medium">
                            {formatPriceSourceLabel(mapping.sourceKey)} ·{" "}
                            {mapping.marketKey}
                          </span>
                          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[11px]"
                            >
                              {projection?.status ?? "unavailable"}
                            </Badge>
                            <span aria-hidden="true">·</span>
                            <span>{formatDate(mapping.lastFetchedAt)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <EditPriceMappingLinkModal
                            mapping={mapping}
                            slug={slug ?? data.gear.slug}
                            disabled={isPending || isInitialFetching}
                            onSaved={async () => {
                              await mutate();
                            }}
                          />
                          {!isManual ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isPending || isInitialFetching}
                              onClick={() => refreshMapping(mapping.id)}
                            >
                              <RefreshCw className="size-4" />
                              {t("refetch")}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${formatPriceSourceLabel(mapping.sourceKey)} ${mapping.marketKey} mapping`}
                            disabled={isPending}
                            onClick={() => disableMapping(mapping.id)}
                          >
                            <Trash2 className="text-destructive size-4" />
                          </Button>
                        </div>
                      </div>

                      {isInitialFetching ? (
                        <div className="bg-muted/20 text-muted-foreground flex min-h-24 items-center justify-center gap-2 rounded-md p-3 text-sm">
                          <LoaderCircle className="size-4 animate-spin" />
                          <span>{t("fetching")}</span>
                        </div>
                      ) : (
                        <>
                          <div className="bg-muted/20 rounded-md p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                              <div>
                                {estimate ? (
                                  <>
                                    <p className="text-lg font-semibold">
                                      {formatMinor(
                                        estimate.typicalMinor,
                                        estimate.currency,
                                      )}
                                    </p>
                                    {estimate.lowMinor !==
                                    estimate.highMinor ? (
                                      <p className="text-muted-foreground text-xs">
                                        {formatMinor(
                                          estimate.lowMinor,
                                          estimate.currency,
                                        )}{" "}
                                        –{" "}
                                        {formatMinor(
                                          estimate.highMinor,
                                          estimate.currency,
                                        )}
                                      </p>
                                    ) : null}
                                  </>
                                ) : (
                                  <p className="text-sm font-medium">
                                    {t("noResultYet")}
                                  </p>
                                )}
                              </div>
                              <p className="text-muted-foreground text-xs sm:text-right">
                                {projection?.observationCount ??
                                  estimate?.observationCount ??
                                  mapping.observations.length}{" "}
                                {t("observations")}
                              </p>
                            </div>
                          </div>

                          {isManual ? (
                            <div className="space-y-3 border-t pt-4">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Select
                                  value={valueKind}
                                  onValueChange={(value) =>
                                    setValueKind(value as "POINT" | "RANGE")
                                  }
                                >
                                  <SelectTrigger
                                    id="price-value-kind"
                                    className="w-full"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="POINT">
                                      Point price
                                    </SelectItem>
                                    <SelectItem value="RANGE">
                                      Price range
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="date"
                                  value={observedDate}
                                  onChange={(event) =>
                                    setObservedDate(event.target.value)
                                  }
                                />
                                {valueKind === "POINT" ? (
                                  <Input
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(event) =>
                                      setAmount(event.target.value)
                                    }
                                    placeholder="Price, e.g. 849"
                                  />
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      inputMode="decimal"
                                      value={lowAmount}
                                      onChange={(event) =>
                                        setLowAmount(event.target.value)
                                      }
                                      placeholder="Low"
                                    />
                                    <Input
                                      inputMode="decimal"
                                      value={highAmount}
                                      onChange={(event) =>
                                        setHighAmount(event.target.value)
                                      }
                                      placeholder="High"
                                    />
                                  </div>
                                )}
                                <Input
                                  value={evidenceUrl}
                                  onChange={(event) =>
                                    setEvidenceUrl(event.target.value)
                                  }
                                  placeholder="Evidence URL (optional)"
                                />
                                <Input
                                  value={note}
                                  onChange={(event) =>
                                    setNote(event.target.value)
                                  }
                                  placeholder="Note (optional)"
                                />
                              </div>
                              <Button
                                type="button"
                                className="w-full"
                                disabled={isPending}
                                onClick={() => addObservation(mapping.id)}
                              >
                                <BadgeDollarSign className="size-4" />
                                Add observation
                              </Button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
                <div>
                  <CreatePriceMappingModal
                    gearId={gearId}
                    mappings={data.mappings}
                    onCreated={handleMappingCreated}
                  />
                </div>
              </div>
            ) : null}

            {archivedMappings.length > 0 ? (
              <details className="rounded-md border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                  Archived mappings ({archivedMappings.length})
                </summary>
                <div className="space-y-2 border-t p-3">
                  {archivedMappings.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {formatPriceSourceLabel(mapping.sourceKey)} ·{" "}
                          {mapping.marketKey}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {mapping.observations.length} observations · archived
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => restoreMapping(mapping.id)}
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
