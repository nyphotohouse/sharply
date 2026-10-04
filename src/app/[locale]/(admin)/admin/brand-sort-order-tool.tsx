"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { splitBrandsWithPriority } from "~/lib/brands";
import { resolveBrandSortSaveCompletion } from "~/lib/brand-sort-order-save";
import {
  actionCreateBrand,
  actionUpdateBrandSortOrders,
} from "~/server/admin/brands/actions";
import slugify from "slugify";

type AdminBrandRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number | null;
};

type BrandDraft = AdminBrandRow;
type SaveState = "saved" | "debouncing" | "saving" | "error";

type BrandSortOrderToolProps = {
  initialBrands: AdminBrandRow[];
};

function normalizeDraftBrands(brands: BrandDraft[]) {
  const { hoisted, remaining } = splitBrandsWithPriority(brands);
  return buildDraftBrands(hoisted, remaining);
}

function splitDraftBrands(brands: BrandDraft[]) {
  const { hoisted, remaining } = splitBrandsWithPriority(brands);
  return {
    orderedBrands: hoisted,
    unrankedBrands: remaining,
  };
}

function buildDraftBrands(
  orderedBrands: BrandDraft[],
  unrankedBrands: BrandDraft[],
) {
  const ranked = orderedBrands.map((brand, index) => ({
    ...brand,
    sortOrder: index + 1,
  }));
  const unranked = [...unrankedBrands]
    .map((brand) => ({ ...brand, sortOrder: null }))
    .sort((firstBrand, secondBrand) =>
      firstBrand.name.localeCompare(secondBrand.name),
    );

  return [...ranked, ...unranked];
}

function buildChangedUpdates(
  draftBrands: BrandDraft[],
  savedBrands: AdminBrandRow[],
) {
  const savedById = new Map(savedBrands.map((brand) => [brand.id, brand]));
  return draftBrands
    .filter(
      (brand) =>
        (savedById.get(brand.id)?.sortOrder ?? null) !== brand.sortOrder,
    )
    .map((brand) => ({
      id: brand.id,
      sortOrder: brand.sortOrder ?? null,
    }));
}

function AddBrandDialog({
  onCreated,
}: {
  onCreated: (brand: AdminBrandRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const slugOverridden = useRef(false);
  const [errors, setErrors] = useState<
    Partial<Record<"name" | "slug", string>>
  >({});

  function resetForm() {
    setName("");
    setSlug("");
    slugOverridden.current = false;
    setErrors({});
  }

  function validateForm() {
    const nextErrors: Partial<Record<"name" | "slug", string>> = {};
    const normalizedName = name.trim();
    const normalizedSlug = slug.trim();
    if (!normalizedName) nextErrors.name = "Brand name is required";
    else if (normalizedName.length > 200) {
      nextErrors.name = "Brand name must be 200 characters or fewer";
    }
    if (!normalizedSlug) nextErrors.slug = "Brand slug is required";
    else if (normalizedSlug.length > 200) {
      nextErrors.slug = "Brand slug must be 200 characters or fewer";
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      nextErrors.slug =
        "Use lowercase letters, numbers, and single hyphens in the slug";
    }
    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateForm();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setCreating(true);
    try {
      const createdBrand = await actionCreateBrand({ name, slug });
      onCreated(createdBrand);
      setOpen(false);
      resetForm();
      toast.success(`Brand “${createdBrand.name}” added`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not add brand";
      const field =
        typeof error === "object" && error !== null && "field" in error
          ? error.field
          : undefined;
      if (field === "name" || field === "slug") {
        setErrors({ [field]: message });
      }
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!creating) {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          Add brand
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!creating}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add brand</DialogTitle>
            <DialogDescription>
              Add a brand to the catalog. The slug is generated from the name
              and can be edited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-brand-name">Brand name</Label>
              <Input
                id="new-brand-name"
                value={name}
                maxLength={200}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={
                  errors.name ? "new-brand-name-error" : undefined
                }
                onChange={(event) => {
                  const nextName = event.target.value;
                  setName(nextName);
                  setErrors((current) => ({ ...current, name: undefined }));
                  if (!slugOverridden.current) {
                    setSlug(slugify(nextName, { lower: true, strict: true }));
                    setErrors((current) => ({ ...current, slug: undefined }));
                  }
                }}
                autoFocus
              />
              {errors.name ? (
                <p
                  id="new-brand-name-error"
                  className="text-destructive text-sm"
                >
                  {errors.name}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-brand-slug">Slug</Label>
              <Input
                id="new-brand-slug"
                value={slug}
                maxLength={200}
                aria-invalid={Boolean(errors.slug)}
                aria-describedby={
                  errors.slug ? "new-brand-slug-error" : undefined
                }
                onChange={(event) => {
                  setSlug(event.target.value);
                  slugOverridden.current = true;
                  setErrors((current) => ({ ...current, slug: undefined }));
                }}
              />
              <p className="text-muted-foreground text-xs">
                Use lowercase letters, numbers, and hyphens.
              </p>
              {errors.slug ? (
                <p
                  id="new-brand-slug-error"
                  className="text-destructive text-sm"
                >
                  {errors.slug}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? <Spinner /> : null}
              {creating ? "Adding…" : "Add brand"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BrandSortOrderTool({ initialBrands }: BrandSortOrderToolProps) {
  const [savedBrands, setSavedBrands] = useState(() =>
    normalizeDraftBrands(initialBrands),
  );
  const [draftBrands, setDraftBrands] = useState(() =>
    normalizeDraftBrands(initialBrands),
  );
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveRetryToken, setSaveRetryToken] = useState(0);
  const saveRequestIdRef = useRef(0);
  const isSavingRef = useRef(false);
  const queuedSignatureRef = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { hoisted: orderedBrands, remaining: unrankedBrands } = useMemo(
    () => splitBrandsWithPriority(draftBrands),
    [draftBrands],
  );

  const changedUpdates = useMemo(
    () => buildChangedUpdates(draftBrands, savedBrands),
    [draftBrands, savedBrands],
  );
  const changedSignature = useMemo(
    () => JSON.stringify(changedUpdates),
    [changedUpdates],
  );

  useEffect(() => {
    if (!changedUpdates.length) {
      setSaveState("saved");
      queuedSignatureRef.current = null;
      return;
    }

    if (isSavingRef.current) {
      queuedSignatureRef.current = changedSignature;
      return;
    }

    setSaveState("debouncing");
    const signatureToSave = changedSignature;

    const timer = window.setTimeout(() => {
      const pendingUpdates = JSON.parse(signatureToSave) as Array<{
        id: string;
        sortOrder: number | null;
      }>;

      const requestId = ++saveRequestIdRef.current;
      isSavingRef.current = true;
      setSaveState("saving");

      void actionUpdateBrandSortOrders({ updates: pendingUpdates })
        .then((nextSavedBrands) => {
          const completion = resolveBrandSortSaveCompletion({
            responseRequestId: requestId,
            latestRequestId: saveRequestIdRef.current,
            queuedSignature: queuedSignatureRef.current,
          });

          if (completion.kind === "stale") {
            return;
          }

          setSavedBrands(normalizeDraftBrands(nextSavedBrands));
          isSavingRef.current = false;

          if (completion.kind === "requeue") {
            queuedSignatureRef.current = null;
            setSaveRetryToken((token) => token + 1);
            return;
          }

          setSaveState("saved");
        })
        .catch((error) => {
          const completion = resolveBrandSortSaveCompletion({
            responseRequestId: requestId,
            latestRequestId: saveRequestIdRef.current,
            queuedSignature: queuedSignatureRef.current,
          });

          if (completion.kind === "stale") {
            return;
          }

          isSavingRef.current = false;

          if (completion.kind === "requeue") {
            queuedSignatureRef.current = null;
            setSaveRetryToken((token) => token + 1);
            return;
          }

          setSaveState("error");
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to update brand sort order",
          );
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [changedSignature, changedUpdates.length, saveRetryToken]);

  const filteredOrderedBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return orderedBrands;
    }
    return orderedBrands.filter((brand) =>
      brand.name.toLowerCase().includes(normalizedQuery),
    );
  }, [orderedBrands, query]);

  const filteredUnrankedBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return unrankedBrands;
    }
    return unrankedBrands.filter((brand) =>
      brand.name.toLowerCase().includes(normalizedQuery),
    );
  }, [query, unrankedBrands]);

  const orderedIds = filteredOrderedBrands.map((brand) => brand.id);

  function replaceDraftSections(
    nextOrderedBrands: BrandDraft[],
    nextUnrankedBrands: BrandDraft[],
  ) {
    return buildDraftBrands(nextOrderedBrands, nextUnrankedBrands);
  }

  function handlePinBrand(brandId: string) {
    setDraftBrands((currentBrands) => {
      const {
        orderedBrands: currentOrderedBrands,
        unrankedBrands: currentUnrankedBrands,
      } = splitDraftBrands(currentBrands);
      const brandToPin = currentUnrankedBrands.find(
        (brand) => brand.id === brandId,
      );
      if (!brandToPin) {
        return currentBrands;
      }

      return replaceDraftSections(
        [
          ...currentOrderedBrands,
          { ...brandToPin, sortOrder: currentOrderedBrands.length + 1 },
        ],
        currentUnrankedBrands.filter((brand) => brand.id !== brandId),
      );
    });
  }

  function handleUnpinBrand(brandId: string) {
    setDraftBrands((currentBrands) => {
      const {
        orderedBrands: currentOrderedBrands,
        unrankedBrands: currentUnrankedBrands,
      } = splitDraftBrands(currentBrands);
      const brandToUnpin = currentOrderedBrands.find(
        (brand) => brand.id === brandId,
      );
      if (!brandToUnpin) {
        return currentBrands;
      }

      return replaceDraftSections(
        currentOrderedBrands.filter((brand) => brand.id !== brandId),
        [...currentUnrankedBrands, { ...brandToUnpin, sortOrder: null }],
      );
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setDraftBrands((currentBrands) => {
      const {
        orderedBrands: currentOrderedBrands,
        unrankedBrands: currentUnrankedBrands,
      } = splitDraftBrands(currentBrands);
      const oldIndex = currentOrderedBrands.findIndex(
        (brand) => brand.id === active.id,
      );
      const newIndex = currentOrderedBrands.findIndex(
        (brand) => brand.id === over.id,
      );
      if (oldIndex < 0 || newIndex < 0) {
        return currentBrands;
      }

      return replaceDraftSections(
        arrayMove(currentOrderedBrands, oldIndex, newIndex),
        currentUnrankedBrands,
      );
    });
  }

  const statusLabel =
    saveState === "saving"
      ? "Saving order..."
      : saveState === "debouncing"
        ? "Changes queued..."
        : saveState === "error"
          ? "Save failed"
          : "Saved";

  return (
    <div className="space-y-6">
      <div className="gap-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Brand Sort Order</h2>
          <p className="text-muted-foreground text-sm">
            Drag ordered brands with the handle to reorder them. Add or remove
            brands from the ordered list, and unranked brands stay alphabetical.
            Changes save automatically and appear across generated brand lists
            after the next rebuild.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <AddBrandDialog
            onCreated={(createdBrand) => {
              setSavedBrands((current) =>
                normalizeDraftBrands([
                  ...current.filter((brand) => brand.id !== createdBrand.id),
                  createdBrand,
                ]),
              );
              setDraftBrands((current) =>
                normalizeDraftBrands([
                  ...current.filter((brand) => brand.id !== createdBrand.id),
                  createdBrand,
                ]),
              );
            }}
          />
          <div className="relative min-w-[260px]">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search brands"
              className="pl-9"
            />
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            {saveState === "saved" ? null : <Spinner />}
            <span>{statusLabel}</span>
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Ordered brands</h3>
            <span className="text-muted-foreground text-xs">
              {orderedBrands.length} ranked
            </span>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">Order</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="w-[120px]">Handle</TableHead>
                  <TableHead className="w-[120px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrderedBrands.length ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={orderedIds}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredOrderedBrands.map((brand) => (
                        <SortableOrderedBrandRow
                          key={brand.id}
                          brand={brand}
                          orderIndex={brand.sortOrder ?? 0}
                          onUnpin={handleUnpinBrand}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No ordered brands match this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Alphabetical fallback</h3>
            <span className="text-muted-foreground text-xs">
              {unrankedBrands.length} unranked
            </span>
          </div>
          <div className="rounded-md border p-3">
            {filteredUnrankedBrands.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredUnrankedBrands.map((brand) => (
                  <div
                    key={brand.id}
                    className="bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {brand.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePinBrand(brand.id)}
                    >
                      <Plus className="size-4" />
                      Rank
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No unranked brands match this search.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableOrderedBrandRow(props: {
  brand: BrandDraft;
  orderIndex: number;
  onUnpin: (brandId: string) => void;
}) {
  const { brand, orderIndex, onUnpin } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: brand.id });

  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "bg-accent/40" : undefined}
    >
      <TableCell>{orderIndex}</TableCell>
      <TableCell className="font-medium">{brand.name}</TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
          Drag
        </Button>
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onUnpin(brand.id)}
        >
          <X className="size-4" />
          Unrank
        </Button>
      </TableCell>
    </TableRow>
  );
}
