"use client";

import { TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { GetGearDisplayName } from "~/lib/gear/naming";
import { useCountry } from "~/lib/hooks/useCountry";
import { getItemDisplayPrice, PRICE_FALLBACK_TEXT } from "~/lib/mapping";
import { getBrandNameById } from "~/lib/mapping/brand-map";
import {
  getPriceMarketForLocaleId,
  type PriceView,
} from "~/lib/pricing/display-price";
import { getSpecFieldDefByKey } from "~/lib/specs/registry";
import { usePriceView } from "~/lib/pricing/use-price-view";
import {
  actionToggleOwnership,
  actionUpdateOwnedGearColorway,
} from "~/server/gear/actions";
import type { GearItem, GearRegion } from "~/types/gear";
import { sortCollectionItems } from "./sort-collection-items";

export const COLLECTION_TABLE_COLUMNS_DEFAULT = [
  "name",
  "displayPrice",
  "frontFilterThreadSizeMm",
  "weightGrams",
] as const;

export type CollectionTableColumnKey =
  (typeof COLLECTION_TABLE_COLUMNS_DEFAULT)[number];

type ColumnConfig = {
  key: CollectionTableColumnKey;
  label: string;
  render: (item: GearItem) => React.ReactNode;
};

type CollectionTableModalProps = {
  items: GearItem[];
  columnKeys?: CollectionTableColumnKey[];
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
};

const DEFAULT_COLLECTION_COLORWAY_VALUE = "__default__";

function buildColumnConfigMap(region: GearRegion, priceView: PriceView) {
  return {
    name: {
      key: "name",
      label: "Name",
      render: (item: GearItem) => {
        const brandName = getBrandNameById(item.brandId);
        const displayName = buildDisplayName(item, brandName, region);
        const brandLabel = brandName || "Unknown brand";

        return (
          <div className="flex min-w-[220px] flex-col">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {brandLabel}
            </span>
            <span className="font-medium">{displayName}</span>
          </div>
        );
      },
    },
    displayPrice: {
      key: "displayPrice",
      label: "Price",
      render: (item: GearItem) => {
        const displayPrice =
          getItemDisplayPrice(item, {
            style: "short",
            padWholeAmounts: true,
            priceView,
          }) ?? PRICE_FALLBACK_TEXT;
        return <span className="font-medium">{displayPrice}</span>;
      },
    },
    frontFilterThreadSizeMm: {
      key: "frontFilterThreadSizeMm",
      label: "Filter thread",
      render: (item: GearItem) => {
        const display = formatFilterThreadDisplay(item);
        return (
          <span
            className={
              display === "Not specified" ? "text-muted-foreground" : ""
            }
          >
            {display}
          </span>
        );
      },
    },
    weightGrams: {
      key: "weightGrams",
      label: "Weight",
      render: (item: GearItem) =>
        renderSpecFieldValue({
          item,
          fieldKey: "weightGrams",
          emptyFallbackLabel: "Not specified",
        }),
    },
  } satisfies Record<CollectionTableColumnKey, ColumnConfig>;
}

function buildDisplayName(
  item: GearItem,
  brandName: string | null | undefined,
  region: GearRegion,
) {
  const resolved = GetGearDisplayName(
    {
      name: item.name,
      regionalAliases: item.regionalAliases ?? [],
    },
    { region },
  );
  const trimmed = stripBrandFromName(resolved, brandName);
  return trimmed || resolved;
}

function stripBrandFromName(name: string, brandName?: string | null) {
  const normalizedName = name?.trim();
  if (!normalizedName) return normalizedName;

  if (!brandName) return normalizedName;

  const normalizedBrand = brandName.trim();
  if (!normalizedBrand) return normalizedName;

  const pattern = new RegExp(
    `^${escapeRegExp(normalizedBrand)}(?:\\s+|[-–—:]\\s*)`,
    "i",
  );

  const stripped = normalizedName.replace(pattern, "").trim();
  return stripped || normalizedName;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatFilterThreadDisplay(item: GearItem): string {
  if (item.gearType !== "LENS") {
    return "";
  }

  const frontFilterSize =
    item.lensSpecs?.frontFilterThreadSizeMm ??
    item.fixedLensSpecs?.frontFilterThreadSizeMm ??
    null;

  const acceptsFilterTypes = Array.isArray(item.lensSpecs?.acceptsFilterTypes)
    ? item.lensSpecs?.acceptsFilterTypes
    : [];

  const hasFrontScrewOn = acceptsFilterTypes.includes("front-screw-on");
  const hasOtherFilterType = acceptsFilterTypes.some(
    (filterType) => filterType !== "front-screw-on",
  );

  if (frontFilterSize != null && Number.isFinite(Number(frontFilterSize))) {
    return `${Number(frontFilterSize)}mm`;
  }

  if (hasOtherFilterType) {
    return "Other";
  }

  if (hasFrontScrewOn) {
    return "Not specified";
  }

  return "Not specified";
}

function renderSpecFieldValue(params: {
  item: GearItem;
  fieldKey: string;
  emptyFallbackLabel?: string;
}) {
  const { item, fieldKey, emptyFallbackLabel = "—" } = params;
  const fieldDefinition = getSpecFieldDefByKey(fieldKey);
  if (!fieldDefinition) return <span className="text-muted-foreground">—</span>;

  if (fieldDefinition.condition && !fieldDefinition.condition(item)) {
    return <span className="text-muted-foreground">{emptyFallbackLabel}</span>;
  }

  const rawValue = fieldDefinition.getRawValue(item);
  const renderedValue = fieldDefinition.formatDisplay
    ? fieldDefinition.formatDisplay(rawValue, item, true)
    : (rawValue as React.ReactNode | undefined);

  if (renderedValue === undefined || renderedValue === null) {
    return <span className="text-muted-foreground">{emptyFallbackLabel}</span>;
  }

  return renderedValue;
}

function getEligibleCollectionColorways(item: GearItem) {
  return (item.colorways ?? []).filter((colorway) => colorway.frontImageUrl);
}

function getSelectedCollectionColorwayId(item: GearItem) {
  const eligibleColorways = getEligibleCollectionColorways(item);
  return eligibleColorways.some(
    (colorway) => colorway.id === item.selectedColorwayId,
  )
    ? (item.selectedColorwayId ?? null)
    : null;
}

export function CollectionTableModal(props: CollectionTableModalProps) {
  const t = useTranslations("userProfile");
  const router = useRouter();
  const {
    items,
    columnKeys = COLLECTION_TABLE_COLUMNS_DEFAULT,
    trigger,
    title,
    description,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const { localeId, region } = useCountry();
  const priceView = usePriceView(getPriceMarketForLocaleId(localeId));
  const columnConfigMap = useMemo(
    () => buildColumnConfigMap(region, priceView),
    [priceView.exchangeRates, priceView.locale, priceView.market, region],
  );
  const [itemsState, setItemsState] = useState<GearItem[]>(() =>
    sortCollectionItems(items),
  );
  const [itemsPropSnapshot, setItemsPropSnapshot] = useState(items);
  const [removingGearItemIds, setRemovingGearItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [updatingColorwayGearItemIds, setUpdatingColorwayGearItemIds] =
    useState<Set<string>>(new Set());

  if (items !== itemsPropSnapshot) {
    setItemsPropSnapshot(items);
    if (isOpen) {
      setItemsState(sortCollectionItems(items));
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) return;
    setItemsState(sortCollectionItems(items));
  };

  const addRemovingId = (gearItemId: string) => {
    setRemovingGearItemIds((previousIds) => {
      const nextIds = new Set(previousIds);
      nextIds.add(gearItemId);
      return nextIds;
    });
  };

  const removeRemovingId = (gearItemId: string) => {
    setRemovingGearItemIds((previousIds) => {
      const nextIds = new Set(previousIds);
      nextIds.delete(gearItemId);
      return nextIds;
    });
  };

  const addUpdatingColorwayId = (gearItemId: string) => {
    setUpdatingColorwayGearItemIds((previousIds) => {
      const nextIds = new Set(previousIds);
      nextIds.add(gearItemId);
      return nextIds;
    });
  };

  const removeUpdatingColorwayId = (gearItemId: string) => {
    setUpdatingColorwayGearItemIds((previousIds) => {
      const nextIds = new Set(previousIds);
      nextIds.delete(gearItemId);
      return nextIds;
    });
  };

  const getToastDisplayName = (item: GearItem) => {
    const brandName = getBrandNameById(item.brandId);
    return buildDisplayName(item, brandName, region);
  };

  const handleUndo = async (item: GearItem) => {
    addRemovingId(item.id);
    const itemDisplayName = getToastDisplayName(item);

    const undoPromise = actionToggleOwnership(item.slug, "add");
    toast.promise(undoPromise, {
      loading: `Adding ${itemDisplayName}...`,
      success: `Added ${itemDisplayName}`,
      error: `Failed to restore ${itemDisplayName}`,
    });

    try {
      await undoPromise;
      startTransition(() => router.refresh());
    } finally {
      removeRemovingId(item.id);
    }
  };

  const handleRemove = async (item: GearItem) => {
    addRemovingId(item.id);
    const itemDisplayName = getToastDisplayName(item);

    const removePromise = actionToggleOwnership(item.slug, "remove");
    toast.promise(removePromise, {
      loading: `Removing ${itemDisplayName}...`,
      success: () => ({
        message: "Removed successfully",
        description: `${itemDisplayName} was removed from your collection`,
        duration: 12000,
        action: {
          label: "Undo",
          onClick: () => void handleUndo(item),
        },
      }),
      error: `Failed to remove ${itemDisplayName}`,
    });

    try {
      await removePromise;
      setItemsState((previousItems) =>
        previousItems.filter((existingItem) => existingItem.id !== item.id),
      );
      startTransition(() => router.refresh());
    } finally {
      removeRemovingId(item.id);
    }
  };

  const handleColorwayChange = async (
    item: GearItem,
    nextColorwayId: string | null,
  ) => {
    addUpdatingColorwayId(item.id);

    try {
      const result = await actionUpdateOwnedGearColorway({
        gearId: item.id,
        colorwayId: nextColorwayId,
      });

      setItemsState((previousItems) =>
        sortCollectionItems(
          previousItems.map((existingItem) =>
            existingItem.id === item.id ? result.item : existingItem,
          ),
        ),
      );
      toast.success(t("collectionColorwayUpdated"));
      startTransition(() => router.refresh());
    } catch {
      toast.error(t("collectionColorwayUpdateFailed"));
    } finally {
      removeUpdatingColorwayId(item.id);
    }
  };

  const columns = useMemo(() => {
    const uniqueKeys: CollectionTableColumnKey[] = [];
    for (const key of columnKeys) {
      if (!uniqueKeys.includes(key)) uniqueKeys.push(key);
    }
    return uniqueKeys
      .map((key) => columnConfigMap[key])
      .filter(Boolean) as ColumnConfig[];
  }, [columnKeys, columnConfigMap]);

  const modalTrigger = trigger ?? (
    <Button variant="outline" size="sm">
      {t("manageCollection")}
    </Button>
  );

  const resolvedTitle = title ?? t("manageCollection");
  const resolvedDescription =
    description ?? t("inspectAndManageCollectionItems");

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger>{modalTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead className="w-[220px]">
                  {t("collectionColorway")}
                </TableHead>
                <TableHead className="w-[80px]">
                  {t("actionsColumnLabel")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemsState.map((item) => {
                const eligibleColorways = getEligibleCollectionColorways(item);
                const selectedColorwayId =
                  getSelectedCollectionColorwayId(item);
                const hasSelectableColorways = eligibleColorways.length > 1;
                const currentColorway =
                  eligibleColorways.find(
                    (colorway) => colorway.id === selectedColorwayId,
                  ) ?? null;

                return (
                  <TableRow key={item.id} className="group">
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {column.render(item)}
                      </TableCell>
                    ))}
                    <TableCell>
                      {hasSelectableColorways ? (
                        <Select
                          value={
                            selectedColorwayId ??
                            DEFAULT_COLLECTION_COLORWAY_VALUE
                          }
                          onValueChange={(value) =>
                            void handleColorwayChange(
                              item,
                              value === DEFAULT_COLLECTION_COLORWAY_VALUE
                                ? null
                                : value,
                            )
                          }
                          disabled={updatingColorwayGearItemIds.has(item.id)}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-full min-w-[180px]"
                            aria-label={t("collectionColorwaySelectLabel")}
                          >
                            <SelectValue
                              placeholder={t("collectionColorwayDefaultOption")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value={DEFAULT_COLLECTION_COLORWAY_VALUE}
                            >
                              {t("collectionColorwayDefaultOption")}
                            </SelectItem>
                            {eligibleColorways.map((colorway) => (
                              <SelectItem key={colorway.id} value={colorway.id}>
                                {colorway.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {currentColorway?.name ??
                            t("collectionColorwayDefaultOption")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => handleRemove(item)}
                        disabled={
                          removingGearItemIds.has(item.id) ||
                          updatingColorwayGearItemIds.has(item.id)
                        }
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CollectionTableModal;
