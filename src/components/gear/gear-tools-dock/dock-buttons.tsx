import {
  BadgeDollarSign,
  BookOpen,
  FileBadge,
  FilePlus,
  ImageIcon,
  SquarePen,
  Palette,
  Tags,
  Waypoints,
  Trash,
  Upload,
  Video,
} from "lucide-react";
import Link from "next/link";

import { RelationshipsManager } from "~/app/[locale]/(pages)/gear/_components/relationships-manager";
import { ManageInstructionManualModal } from "~/app/[locale]/(pages)/gear/_components/manage-instruction-manual-modal";
import { ManageCreatorVideosModal } from "~/app/[locale]/(pages)/gear/_components/manage-creator-videos-modal";
import { ManageStaffVerdictModal } from "~/app/[locale]/(pages)/gear/_components/manage-staff-verdict-modal";
import type { AuthUser } from "~/auth";
import { GearImageModal } from "~/components/modals/gear-image-modal";
import { ManageColorwaysModal } from "~/components/gear/manage-colorways-modal";
import { ManageGearTagsModal } from "~/components/gear/manage-gear-tags-modal";
import { ManagePriceModal } from "~/components/gear/manage-price-modal";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { requireRole } from "~/lib/auth/auth-helpers";
import { formatDate } from "~/lib/format/date";
import { UploadDropzone } from "~/lib/utils/uploadthing";
import type {
  GearAlternativeRow,
  GearLineageRelationships,
} from "~/server/gear/service";
import type { GearColorway, GearType, RawSample } from "~/types/gear";

type DockSample = Omit<RawSample, "createdAt" | "updatedAt"> & {
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type DockButtonConfig = {
  id: string;
  allowed: (user: AuthUser | null | undefined) => boolean;
  render: (params: { isPreRelease: boolean }) => React.ReactNode;
};

export interface BuildDockButtonsParams {
  slug: string;
  gearId?: string;
  gearType: GearType;
  currentThumbnailUrl?: string | null;
  currentTopViewUrl?: string | null;
  currentRearViewUrl?: string | null;
  currentLeftViewUrl?: string | null;
  currentRightViewUrl?: string | null;
  colorways: GearColorway[];
  currentInstructionManualUrl?: string | null;
  instructionManualLabel: string;
  instructionManualManageLabel: string;
  unavailableUntilPublishedLabel: string;
  colorwaysManageLabel: string;
  relationshipsLabel: string;
  locale: string;
  alternatives: GearAlternativeRow[];
  lineage: GearLineageRelationships;
  relationshipDataReady: boolean;
  hasCreatorVideos: boolean;
  managedSamples: DockSample[];
  isManagerOpen: boolean;
  setIsManagerOpen: (value: boolean) => void;
  deletingSampleId: string | null;
  isUploading: boolean;
  handleSampleUploadCompletion: (items?: unknown[]) => Promise<void>;
  handleSampleRemoval: (sampleId: string) => Promise<void>;
}

const MAX_SAMPLES = 3;
const baseTriggerClass =
  "hover:bg-accent/80 flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:cursor-pointer hover:border hover:bg-accent/80 ";

export function buildDockButtons({
  slug,
  gearId,
  gearType,
  currentThumbnailUrl,
  currentTopViewUrl,
  currentRearViewUrl,
  currentLeftViewUrl,
  currentRightViewUrl,
  colorways,
  currentInstructionManualUrl,
  instructionManualLabel,
  instructionManualManageLabel,
  unavailableUntilPublishedLabel,
  colorwaysManageLabel,
  relationshipsLabel,
  locale,
  alternatives,
  lineage,
  relationshipDataReady,
  managedSamples,
  isManagerOpen,
  setIsManagerOpen,
  deletingSampleId,
  isUploading,
  handleSampleUploadCompletion,
  handleSampleRemoval,
}: BuildDockButtonsParams): DockButtonConfig[] {
  const disabledTriggerClass =
    "flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full opacity-45 transition-opacity";

  function renderUnavailableButton(
    id: string,
    label: string,
    icon: React.ReactNode,
  ) {
    return (
      <Tooltip key={id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={disabledTriggerClass}
            aria-label={label}
            disabled
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={10}>
          {unavailableUntilPublishedLabel}
        </TooltipContent>
      </Tooltip>
    );
  }

  return [
    {
      id: "edit specs",
      allowed: (currentUser) => Boolean(requireRole(currentUser, ["EDITOR"])),
      render: () => (
        <Tooltip key="edit specs">
          <TooltipTrigger asChild>
            <Link
              href={`/gear/${slug}/edit`}
              className={baseTriggerClass}
              scroll={false}
            >
              <SquarePen className="text-foreground/70 size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent sideOffset={10}>Edit Specs</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "images",
      allowed: (currentUser) => Boolean(requireRole(currentUser, ["EDITOR"])),
      render: () => (
        <Tooltip key="images">
          <GearImageModal
            gearId={gearId}
            slug={slug}
            gearType={gearType}
            currentThumbnailUrl={currentThumbnailUrl ?? undefined}
            currentTopViewUrl={currentTopViewUrl ?? undefined}
            currentRearViewUrl={currentRearViewUrl ?? undefined}
            currentLeftViewUrl={currentLeftViewUrl ?? undefined}
            currentRightViewUrl={currentRightViewUrl ?? undefined}
            currentColorways={colorways}
            trigger={
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={baseTriggerClass}
                  aria-label="Manage Images"
                >
                  <ImageIcon className="text-foreground/70 size-4.5" />
                </button>
              </TooltipTrigger>
            }
          />
          <TooltipContent sideOffset={10}>Gear Images</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "pricing",
      allowed: (currentUser) =>
        Boolean(gearId && requireRole(currentUser, ["EDITOR"])),
      render: () => (
        <Tooltip key="pricing">
          <ManagePriceModal
            gearId={gearId!}
            slug={slug}
            trigger={
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={baseTriggerClass}
                  aria-label="Manage Used Prices"
                >
                  <BadgeDollarSign className="text-foreground/70 size-4.5" />
                </button>
              </TooltipTrigger>
            }
          />
          <TooltipContent sideOffset={10}>Used Prices</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "tags",
      allowed: (currentUser) =>
        Boolean(gearId && requireRole(currentUser, ["ADMIN"])),
      render: () => (
        <Tooltip key="tags">
          <ManageGearTagsModal
            gearId={gearId!}
            slug={slug}
            trigger={
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={baseTriggerClass}
                  aria-label="Manage Tags"
                >
                  <Tags className="text-foreground/70 size-4.5" />
                </button>
              </TooltipTrigger>
            }
          />
          <TooltipContent sideOffset={10}>Manage Tags</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "colorways",
      allowed: (currentUser) =>
        Boolean(gearId && requireRole(currentUser, ["EDITOR"])),
      render: () =>
        gearId ? (
          <Tooltip key="colorways">
            <ManageColorwaysModal
              gearId={gearId}
              initialColorways={colorways}
              trigger={
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={baseTriggerClass}
                    aria-label={colorwaysManageLabel}
                  >
                    <Palette className="text-foreground/70 size-4.5" />
                  </button>
                </TooltipTrigger>
              }
            />
            <TooltipContent sideOffset={10}>
              {colorwaysManageLabel}
            </TooltipContent>
          </Tooltip>
        ) : null,
    },
    {
      id: "instruction manual",
      allowed: (currentUser) => Boolean(requireRole(currentUser, ["EDITOR"])),
      render: () => (
        <Tooltip key="instruction manual">
          <ManageInstructionManualModal
            slug={slug}
            initialLinkInstructionManual={currentInstructionManualUrl ?? null}
            trigger={
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={baseTriggerClass}
                  aria-label={instructionManualManageLabel}
                >
                  <BookOpen className="text-foreground/70 size-4.5" />
                </button>
              </TooltipTrigger>
            }
          />
          <TooltipContent sideOffset={10}>
            {instructionManualLabel}
          </TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "relationships",
      allowed: (currentUser) =>
        Boolean(
          relationshipDataReady &&
          gearId &&
          requireRole(currentUser, ["EDITOR"]),
        ),
      render: () =>
        gearId ? (
          <Tooltip key="relationships">
            <RelationshipsManager
              gearId={gearId}
              gearSlug={slug}
              gearType={gearType}
              initialAlternatives={alternatives}
              initialLineage={lineage}
              trigger={
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={baseTriggerClass}
                    aria-label={relationshipsLabel}
                  >
                    <Waypoints className="text-foreground/70 size-4.5" />
                  </button>
                </TooltipTrigger>
              }
            />
            <TooltipContent sideOffset={10}>
              {relationshipsLabel}
            </TooltipContent>
          </Tooltip>
        ) : null,
    },
    {
      id: "videos",
      allowed: (currentUser) => Boolean(requireRole(currentUser, ["EDITOR"])),
      render: ({ isPreRelease }) =>
        isPreRelease ? (
          renderUnavailableButton(
            "videos-disabled",
            "Manage Creator Videos",
            <Video className="text-foreground/70 size-4.5" />,
          )
        ) : (
          <Tooltip key="videos">
            <ManageCreatorVideosModal
              slug={slug}
              trigger={
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={baseTriggerClass}
                    aria-label="Manage Creator Videos"
                  >
                    <Video className="text-foreground/70 size-4.5" />
                  </button>
                </TooltipTrigger>
              }
            />
            <TooltipContent sideOffset={10}>Creator Videos</TooltipContent>
          </Tooltip>
        ),
    },
    {
      id: "staff verdict",
      allowed: (currentUser) =>
        Boolean(requireRole(currentUser, ["ADMIN", "SUPERADMIN"])),
      render: ({ isPreRelease }) =>
        isPreRelease ? (
          renderUnavailableButton(
            "staff-verdict-disabled",
            "Manage Staff Verdict",
            <FileBadge className="text-foreground/70 size-4.5" />,
          )
        ) : (
          <Tooltip key="staff verdict">
            <ManageStaffVerdictModal
              slug={slug}
              trigger={
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={baseTriggerClass}
                    aria-label="Manage Staff Verdict"
                  >
                    <FileBadge className="text-foreground/70 size-4.5" />
                  </button>
                </TooltipTrigger>
              }
            />
            <TooltipContent sideOffset={10}>Staff Verdict</TooltipContent>
          </Tooltip>
        ),
    },
    {
      id: "samples",
      allowed: (currentUser) =>
        Boolean(
          gearType === "CAMERA" &&
          requireRole(currentUser, ["ADMIN", "SUPERADMIN"]),
        ),
      render: ({ isPreRelease }) =>
        isPreRelease ? (
          renderUnavailableButton(
            "samples-disabled",
            "Manage Samples",
            <FilePlus className="text-foreground/70 size-4.5" />,
          )
        ) : (
          <Dialog open={isManagerOpen} onOpenChange={setIsManagerOpen}>
            <Tooltip key="samples">
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className={baseTriggerClass}
                    aria-label="Manage Samples"
                  >
                    <FilePlus className="text-foreground/70 size-4.5" />
                  </button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>Raw Samples</TooltipContent>
            </Tooltip>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Raw Sample Archive</DialogTitle>
                <DialogDescription>
                  Upload and remove downloadable raw files for this gear item.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="border-border space-y-2 rounded-md border border-dashed p-4 text-sm">
                  {managedSamples.length >= MAX_SAMPLES ? (
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      <p className="text-xs">
                        Maximum of three samples reached. Remove one to upload
                        another.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        <span>Drop a file or click to upload</span>
                      </div>
                      <UploadDropzone
                        endpoint="rawSampleUploader"
                        onClientUploadComplete={handleSampleUploadCompletion}
                        onUploadError={(uploadError) => {
                          const message =
                            uploadError instanceof Error
                              ? uploadError.message
                              : "Upload failed";
                          console.error(message);
                        }}
                        disabled={isUploading}
                      />
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  {managedSamples.length === 0 ? (
                    <p className="text-sm">
                      No samples yet. Upload a file to make it available.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {managedSamples.map((sample) => {
                        const displayName =
                          sample.originalFilename ?? sample.fileUrl;
                        const timestamp = sample.createdAt ?? sample.updatedAt;
                        return (
                          <li
                            key={sample.id}
                            className="flex items-center justify-between gap-3 rounded-md border p-2"
                          >
                            <div className="space-y-1 text-sm">
                              <p className="font-medium">{displayName}</p>
                              <p className="text-xs">
                                {timestamp
                                  ? formatDate(timestamp, {
                                      locale,
                                      preset: "datetime-short",
                                    })
                                  : "Unknown date"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={sample.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary text-xs underline"
                              >
                                View
                              </Link>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                disabled={
                                  deletingSampleId === sample.id || isUploading
                                }
                                onClick={() => handleSampleRemoval(sample.id)}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ),
    },
  ];
}
