"use client";
// (client component) will contain our column definitions.

import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { RenameGearDialog } from "~/components/gear/rename-gear-dialog";
import { GearImageModal } from "~/components/modals/gear-image-modal";
import { ManagePriceModal } from "~/components/gear/manage-price-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { formatDate } from "~/lib/format/date";
import { getUsedPricingPreview } from "~/lib/pricing/used-pricing-preview";
import {
  actionDeleteGear,
  actionUpdateGearPublicationState,
} from "~/server/admin/gear/actions";
import type { AdminGearTableRow } from "~/types/gear";

// TO ADD A COLUMN:
// 1. Add the field to `adminGearSelect` in `~/server/admin/gear/data.ts`.
//    The `AdminGearTableRow` type is derived automatically from that select.
// 2. Add the column definition below (header/accessor/cell as needed).

function GearActionsCell({ row }: { row: { original: AdminGearTableRow } }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await actionDeleteGear(row.original.id);
      toast.success("Gear deleted", { description: row.original.name });
      void mutate(
        (key) =>
          typeof key === "string" && key.startsWith("/api/admin/gear/list?"),
        (
          current:
            | { items: AdminGearTableRow[]; totalCount: number }
            | undefined,
        ) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.filter((it) => it.id !== row.original.id),
            totalCount: current.totalCount - 1,
          };
        },
        { revalidate: true },
      );
    } catch {
      toast.error("Failed to delete gear");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Copy ID"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(row.original.id);
                toast("Copied gear ID", { description: row.original.id });
              } catch {
                toast("Failed to copy ID");
              }
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy ID</TooltipContent>
      </Tooltip>

      <RenameGearDialog
        gearId={row.original.id}
        currentName={row.original.name}
        currentSlug={row.original.slug}
        showNavigateOption
        onSuccess={(res) => {
          // Optimistically update any cached admin gear list pages where this row exists,
          // then revalidate to ensure freshness.
          void mutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith("/api/admin/gear/list?"),
            (
              current:
                | { items: AdminGearTableRow[]; totalCount: number }
                | undefined,
            ) => {
              if (!current) return current;
              return {
                ...current,
                items: current.items.map((it) =>
                  it.id === res.id
                    ? { ...it, name: res.name, slug: res.slug }
                    : it,
                ),
              };
            },
            { revalidate: true },
          );
        }}
        trigger={
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        }
      />

      <GearImageModal
        gearId={row.original.id}
        gearType={row.original.gearType}
        currentThumbnailUrl={row.original.thumbnailUrl ?? undefined}
        currentTopViewUrl={row.original.topViewUrl ?? undefined}
        currentRearViewUrl={row.original.rearViewUrl ?? undefined}
        currentLeftViewUrl={row.original.leftViewUrl ?? undefined}
        currentRightViewUrl={row.original.rightViewUrl ?? undefined}
        trigger={
          <Button variant="ghost" size="sm" aria-label="Manage Images">
            <ImageIcon className="h-4 w-4" />
          </Button>
        }
      />

      <AlertDialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Delete gear"
                disabled={isDeleting}
              >
                <Trash2 className="text-destructive h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete gear item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">{row.original.name}</span> and all
              associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreatedAtCell({ row }: { row: { original: AdminGearTableRow } }) {
  const locale = useLocale();

  return (
    <div>
      {formatDate(row.original.createdAt, {
        locale,
        preset: "date-long",
      })}
    </div>
  );
}

function PublicationStateCell({
  row,
}: {
  row: { original: AdminGearTableRow };
}) {
  const t = useTranslations("gearDetail");
  const [publicationState, setPublicationState] = useState(
    row.original.publicationState,
  );
  const [isUpdating, setIsUpdating] = useState(false);

  const syncTable = (nextState: AdminGearTableRow["publicationState"]) => {
    void mutate(
      (key) =>
        typeof key === "string" && key.startsWith("/api/admin/gear/list?"),
      (
        current: { items: AdminGearTableRow[]; totalCount: number } | undefined,
      ) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === row.original.id
              ? { ...item, publicationState: nextState }
              : item,
          ),
        };
      },
      { revalidate: true },
    );
  };

  return (
    <Select
      value={publicationState}
      onValueChange={async (nextState) => {
        if (nextState === publicationState || isUpdating) return;

        const previousState = publicationState;
        const typedState = nextState as AdminGearTableRow["publicationState"];
        setPublicationState(typedState);
        setIsUpdating(true);

        try {
          await actionUpdateGearPublicationState({
            gearId: row.original.id,
            publicationState: typedState,
          });
          syncTable(typedState);
          toast.success(t("publicationStateUpdated"));
        } catch {
          setPublicationState(previousState);
          toast.error(t("publicationStateUpdateFailed"));
        } finally {
          setIsUpdating(false);
        }
      }}
      disabled={isUpdating}
    >
      <SelectTrigger className="h-8 min-w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={GEAR_PUBLICATION_STATES.PUBLISHED}>
          {t("publicationStatePublished")}
        </SelectItem>
        <SelectItem value={GEAR_PUBLICATION_STATES.RUMORED}>
          {t("publicationStateRumored")}
        </SelectItem>
        <SelectItem value={GEAR_PUBLICATION_STATES.HIDDEN}>
          {t("publicationStateHidden")}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function UsedPricingCell({ row }: { row: { original: AdminGearTableRow } }) {
  const preview = getUsedPricingPreview(
    row.original.usedPriceProjection,
    row.original.usedPricingMode,
  );

  return (
    <ManagePriceModal
      gearId={row.original.id}
      slug={row.original.slug}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto min-h-8 justify-start px-2 py-1 text-left"
          aria-label={`Manage used pricing for ${row.original.name}`}
        >
          {preview.price ? (
            <span className="font-medium">
              {preview.price}
              {preview.modeLabel ? (
                <span className="text-muted-foreground font-normal">
                  {` - ${preview.modeLabel}`}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">No Pricing</span>
          )}
        </Button>
      }
    />
  );
}

export const columns: ColumnDef<AdminGearTableRow>[] = [
  {
    header: "Name",
    accessorKey: "name",
    cell: ({ row }) => {
      return (
        <div className="min-w-0">
          <Link
            className="font-medium hover:underline"
            href={`/gear/${row.original.slug}`}
          >
            {row.original.name}
          </Link>
          <span className="text-muted-foreground mt-0.5 block max-w-[18rem] truncate font-mono text-xs">
            {row.original.slug}
          </span>
        </div>
      );
    },
  },
  {
    header: "Brand",
    accessorKey: "brandName",
  },
  {
    header: "Type",
    accessorKey: "gearType",
  },
  {
    header: "State",
    accessorKey: "publicationState",
    cell: ({ row }) => <PublicationStateCell row={row} />,
  },
  {
    header: "Used Pricing",
    accessorKey: "usedPricingMode",
    cell: ({ row }) => <UsedPricingCell row={row} />,
  },
  {
    header: "Created At",
    accessorKey: "createdAt",
    cell: ({ row }) => <CreatedAtCell row={row} />,
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      return <GearActionsCell row={row} />;
    },
  },
];
