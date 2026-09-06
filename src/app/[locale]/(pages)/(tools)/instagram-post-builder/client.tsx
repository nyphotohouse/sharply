"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import JSZip from "jszip";
import {
  Download,
  GripVertical,
  Image as ImageIcon,
  Layers,
  PanelLeft,
  Plus,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { getImageRenderRect } from "./image-sizing";

type FrameImage = {
  id: number;
  src: string;
  width: number;
  height: number;
  position: { x: number; y: number };
};

type Frame = {
  id: number;
  span: number;
  images: FrameImage[];
};

type Settings = {
  aspectRatio: number;
  padding: number;
  bgColor: string;
  peekAmount: number;
  showGuides: boolean;
  fitImages: boolean;
};

type DragState = {
  isDragging: boolean;
  frameId: number | null;
  imageId: number | null;
  startX: number;
  startY: number;
  initialPosX: number;
  initialPosY: number;
};

type FrameRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SortableFrameProps = {
  frame: Frame;
  rect: FrameRect;
  totalWidth: number;
  totalHeight: number;
  totalSpan: number;
  slideLabel: string;
  isActive: boolean;
  onSelect: (frameId: number) => void;
  onRemove: (frameId: number) => void;
  onUpload: (frameId: number) => void;
  onSetSpan: (frameId: number, span: number) => void;
  children: React.ReactNode;
};

const FRAME_WIDTH = 1080;
const DEFAULT_SETTINGS: Settings = {
  aspectRatio: 4 / 5,
  padding: 16,
  bgColor: "#FFFFFF",
  peekAmount: 0,
  showGuides: true,
  fitImages: false,
};

const ASPECT_RATIO_GROUPS = [
  {
    labelKey: "square",
    ratios: [{ label: "1:1", value: 1 }],
  },
  {
    labelKey: "portrait",
    ratios: [
      { label: "4:5", value: 4 / 5 },
      { label: "3:4", value: 3 / 4 },
      { label: "9:16", value: 9 / 16 },
    ],
  },
  {
    labelKey: "landscape",
    ratios: [
      { label: "5:4", value: 5 / 4 },
      { label: "4:3", value: 4 / 3 },
      { label: "16:9", value: 16 / 9 },
    ],
  },
] as const;

const COLORS = ["#FFFFFF", "#000000"];
const PANORAMA_SPAN_OPTIONS = [2, 3, 4];

const getFrameRect = (
  frameOffset: number,
  frameWidth: number,
  index: number,
  totalFrames: number,
  settings: Settings,
): FrameRect => {
  const { padding, peekAmount, aspectRatio } = settings;
  const totalHeight = FRAME_WIDTH / aspectRatio;

  const leftBoundary =
    index === 1 && totalFrames > 1 ? frameOffset - peekAmount : frameOffset;

  const rightBoundary =
    index === 0 && totalFrames > 1
      ? frameOffset + frameWidth - peekAmount
      : frameOffset + frameWidth;

  const hasPeek = peekAmount > 0;
  const paddingLeft =
    hasPeek && index === 1 && totalFrames > 1 ? padding / 2 : padding;
  const paddingRight =
    hasPeek && index === 0 && totalFrames > 1 ? padding / 2 : padding;

  const x = leftBoundary + paddingLeft;
  const width = rightBoundary - leftBoundary - paddingLeft - paddingRight;

  return {
    x,
    y: padding,
    w: Math.max(0, width),
    h: totalHeight - padding * 2,
  };
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const getNextFrameId = (frames: Frame[]) =>
  frames.length === 0 ? 1 : Math.max(...frames.map((frame) => frame.id)) + 1;

function SortableFrame({
  frame,
  rect,
  totalWidth,
  totalHeight,
  totalSpan,
  slideLabel,
  isActive,
  onSelect,
  onRemove,
  onUpload,
  onSetSpan,
  children,
}: SortableFrameProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: frame.id,
    disabled: totalSpan <= 1,
  });

  const leftPct = (rect.x / totalWidth) * 100;
  const topPct = (rect.y / totalHeight) * 100;
  const widthPct = (rect.w / totalWidth) * 100;
  const heightPct = (rect.h / totalHeight) * 100;

  return (
    <div
      ref={setNodeRef}
      className="absolute z-10"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 40 : isActive ? 20 : 10,
      }}
    >
      {totalSpan > 1 ? (
        <div
          className={`border-border bg-background/95 text-foreground absolute top-0 left-1/2 z-30 flex -translate-x-1/2 -translate-y-[140%] items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold shadow transition-shadow ${
            isDragging ? "shadow-xl" : ""
          }`}
        >
          <button
            type="button"
            aria-label={`Reorder ${slideLabel}`}
            className="text-muted-foreground hover:text-foreground cursor-grab rounded-full p-1 transition active:cursor-grabbing"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
            <span className="sr-only">Drag to reorder</span>
          </button>
          <span>{slideLabel}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Delete ${slideLabel}`}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-6 w-6"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(frame.id);
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ) : null}

      <div
        className={`absolute inset-0 overflow-hidden transition duration-200 ${
          isActive ? "ring-primary ring-2" : ""
        }`}
        onClick={() => onSelect(frame.id)}
      >
        {children}
      </div>

      {isActive ? (
        <div className="absolute top-full left-1/2 z-20 flex -translate-x-1/2 translate-y-3 flex-col gap-2">
          <div className="border-border bg-popover/80 flex items-center gap-2 rounded-lg border p-1.5 shadow-lg">
            <Button
              type="button"
              size="sm"
              onClick={() => onUpload(frame.id)}
              className="flex items-center gap-1"
            >
              <Layers size={14} /> Add Image
            </Button>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={frame.images.length === 0}
                onClick={() => onSetSpan(frame.id, 2)}
                className="flex items-center gap-1"
              >
                Extend (panorama)
              </Button>
              {PANORAMA_SPAN_OPTIONS.map((spanOption) => (
                <Button
                  key={spanOption}
                  type="button"
                  size="icon"
                  variant={frame.span === spanOption ? "default" : "ghost"}
                  disabled={frame.images.length === 0}
                  onClick={() => onSetSpan(frame.id, spanOption)}
                  className="min-w-10"
                >
                  {spanOption}x
                </Button>
              ))}
              <Button
                type="button"
                size="icon"
                variant={frame.span === 1 ? "default" : "ghost"}
                disabled={frame.images.length === 0}
                onClick={() => onSetSpan(frame.id, 1)}
                className="min-w-10"
              >
                1x
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const InstagramPostBuilderPage = () => {
  const isMobile = useIsMobile();
  const t = useTranslations("instagramPostBuilder");
  const [frames, setFrames] = useState<Frame[]>([
    { id: 1, span: 1, images: [] },
  ]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeFrameId, setActiveFrameId] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    frameId: null,
    imageId: null,
    startX: 0,
    startY: 0,
    initialPosX: 50,
    initialPosY: 50,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetFrameRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceHeight, setWorkspaceHeight] = useState(0);

  const totalSpan = useMemo(
    () => frames.reduce((sum, frame) => sum + frame.span, 0),
    [frames],
  );

  const totalSlides = totalSpan;

  const totalWidth = useMemo(() => totalSpan * FRAME_WIDTH, [totalSpan]);
  const totalHeight = useMemo(
    () => FRAME_WIDTH / settings.aspectRatio,
    [settings.aspectRatio],
  );

  const frameOffsets = useMemo(() => {
    let offset = 0;
    return frames.map((frame) => {
      const currentOffset = offset;
      offset += frame.span * FRAME_WIDTH;
      return currentOffset;
    });
  }, [frames]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWorkspaceHeight(entry.contentRect.height);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const canvasHeight = useMemo(() => {
    if (!workspaceHeight) {
      return null;
    }
    const paddingAllowance = 48;
    return Math.max(workspaceHeight - paddingAllowance, 320);
  }, [workspaceHeight]);

  const renderHeight = useMemo(() => {
    if (!canvasHeight) {
      return null;
    }
    return Math.max(canvasHeight * 0.7, 260);
  }, [canvasHeight]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const frameIds = useMemo(() => frames.map((frame) => frame.id), [frames]);

  const addFrame = () => {
    const newId = getNextFrameId(frames);
    setFrames((prev) => [...prev, { id: newId, span: 1, images: [] }]);
  };

  const removeFrame = (frameId: number) => {
    setFrames((prev) => {
      if (prev.length === 1) {
        return [{ id: 1, span: 1, images: [] }];
      }
      const nextFrames = prev.filter((frame) => frame.id !== frameId);
      if (activeFrameId === frameId) {
        setActiveFrameId(null);
      }
      return nextFrames;
    });
  };

  const triggerUpload = (frameId: number) => {
    targetFrameRef.current = frameId;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const deleteImage = (frameId: number, imageId: number) => {
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === frameId
          ? {
              ...frame,
              images: frame.images.filter((image) => image.id !== imageId),
            }
          : frame,
      ),
    );
  };

  const setFrameSpan = (frameId: number, span: number) => {
    const safeSpan = Math.max(1, Math.min(10, Math.round(span)));
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === frameId ? { ...frame, span: safeSpan } : frame,
      ),
    );
  };

  const handleFrameReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setFrames((prev) => {
      const oldIndex = prev.findIndex((frame) => frame.id === active.id);
      const newIndex = prev.findIndex((frame) => frame.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return prev;
      }

      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const targetFrame = targetFrameRef.current ?? frames[0]?.id;
    if (!targetFrame) {
      return;
    }

    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const toDataPromises = Array.from(files).map(
      (file) =>
        new Promise<FrameImage>((resolve) => {
          const reader = new FileReader();
          reader.onload = (readerEvent) => {
            const img = new Image();
            img.onload = () => {
              resolve({
                id: Number(`${Date.now()}${Math.random()}`),
                src: readerEvent.target?.result as string,
                width: img.width,
                height: img.height,
                position: { x: 50, y: 50 },
              });
            };
            img.src = readerEvent.target?.result as string;
          };
          reader.readAsDataURL(file);
        }),
    );

    const newImages = await Promise.all(toDataPromises);
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === targetFrame
          ? { ...frame, images: [...frame.images, ...newImages] }
          : frame,
      ),
    );
    setActiveFrameId(targetFrame);
  };

  const handleMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
    frameId: number,
    imageId: number,
    currentPos: { x: number; y: number },
  ) => {
    event.preventDefault();
    setDragState({
      isDragging: true,
      frameId,
      imageId,
      startX: event.clientX,
      startY: event.clientY,
      initialPosX: currentPos.x,
      initialPosY: currentPos.y,
    });
    setActiveFrameId(frameId);
  };

  useEffect(() => {
    if (!dragState.isDragging) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      if (!dragState.isDragging) {
        return;
      }
      const sensitivity = 0.05;
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      const nextX = Math.max(
        0,
        Math.min(100, dragState.initialPosX - deltaX * sensitivity),
      );
      const nextY = Math.max(
        0,
        Math.min(100, dragState.initialPosY - deltaY * sensitivity),
      );

      setFrames((prev) =>
        prev.map((frame) =>
          frame.id === dragState.frameId
            ? {
                ...frame,
                images: frame.images.map((image) =>
                  image.id === dragState.imageId
                    ? { ...image, position: { x: nextX, y: nextY } }
                    : image,
                ),
              }
            : frame,
        ),
      );
    };

    const handleUp = () => {
      setDragState((prev) => ({ ...prev, isDragging: false }));
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState]);

  const generateCanvas = async (mode: "single" | "all") => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return [];
    }

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    for (const [frameIndex, frame] of frames.entries()) {
      const frameOffset = frameOffsets[frameIndex] ?? 0;
      const frameWidth = frame.span * FRAME_WIDTH;
      const rect = getFrameRect(
        frameOffset,
        frameWidth,
        frameIndex,
        frames.length,
        settings,
      );

      if (frame.images.length === 0) {
        continue;
      }

      const segmentHeight = rect.h / frame.images.length;

      for (const [imageIndex, imageData] of frame.images.entries()) {
        const image = await loadImage(imageData.src);

        const clipY = rect.y + segmentHeight * imageIndex;
        const clipW = rect.w;
        const clipH = segmentHeight;

        const renderRect = getImageRenderRect({
          imageWidth: image.width,
          imageHeight: image.height,
          boxX: rect.x,
          boxY: clipY,
          boxWidth: clipW,
          boxHeight: clipH,
          mode: settings.fitImages ? "fit" : "fill",
          position: imageData.position,
        });

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, clipY, clipW, clipH);
        ctx.clip();
        ctx.drawImage(
          image,
          renderRect.x,
          renderRect.y,
          renderRect.width,
          renderRect.height,
        );
        ctx.restore();
      }
    }

    if (mode === "single") {
      return [];
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = FRAME_WIDTH;
    exportCanvas.height = totalHeight;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) {
      return [];
    }

    const slideOwners: Array<{
      frameId: number;
      frameSlideIndex: number;
    }> = [];
    frames.forEach((frame) => {
      for (let index = 0; index < frame.span; index += 1) {
        slideOwners.push({ frameId: frame.id, frameSlideIndex: index + 1 });
      }
    });

    const slices: Array<{ id: number; url: string; slideNumber: number }> = [];
    slideOwners.forEach((owner, slideIndex) => {
      exportCtx.clearRect(0, 0, FRAME_WIDTH, totalHeight);
      exportCtx.drawImage(
        canvas,
        slideIndex * FRAME_WIDTH,
        0,
        FRAME_WIDTH,
        totalHeight,
        0,
        0,
        FRAME_WIDTH,
        totalHeight,
      );
      const url = exportCanvas.toDataURL("image/jpeg", 0.95);
      slices.push({
        id: owner.frameId,
        url,
        slideNumber: slideIndex + 1,
      });
    });

    return slices;
  };

  const handleExport = async () => {
    const slices = await generateCanvas("all");
    if (slices.length === 0) {
      return;
    }

    const zip = new JSZip();
    await Promise.all(
      slices.map(async (slice) => {
        const blob = await dataUrlToBlob(slice.url);
        zip.file(`slide-${slice.slideNumber}.jpg`, blob);
      }),
    );

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const objectUrl = URL.createObjectURL(zipBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = objectUrl;
    downloadLink.download = `instagram-strip-${Date.now()}.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(objectUrl);
  };

  const renderFrameContent = (frame: Frame) => {
    const tileHeight = 100 / frame.images.length;
    return frame.images.map((image, index) => (
      <div
        key={image.id}
        className={cn(
          "group absolute w-full overflow-hidden",
          settings.fitImages ? "cursor-default" : "cursor-move",
        )}
        style={{
          top: `${index * tileHeight}%`,
          height: `${tileHeight}%`,
        }}
        onMouseDown={
          settings.fitImages
            ? undefined
            : (event) =>
                handleMouseDown(event, frame.id, image.id, image.position)
        }
      >
        <NextImage
          src={image.src}
          alt="Uploaded media"
          fill
          unoptimized
          sizes="33vw"
          className={cn(
            "pointer-events-none",
            settings.fitImages ? "object-contain" : "object-cover",
          )}
          style={{
            objectPosition: settings.fitImages
              ? "50% 50%"
              : `${image.position.x}% ${image.position.y}%`,
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Remove image"
          className="hover:bg-destructive hover:text-destructive-foreground absolute top-2 right-2 z-20 opacity-0 transition group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            deleteImage(frame.id, image.id);
          }}
        >
          <X size={12} />
        </Button>
      </div>
    ));
  };

  if (isMobile) {
    return (
      <div className="bg-background text-foreground flex h-screen flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold">Desktop Only</h1>
          <p className="text-muted-foreground">
            The Instagram post builder is currently optimized for desktop.
            Switch to a larger screen to craft your carousel.
          </p>
          <Button asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex h-screen flex-col font-sans">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <main className="bg-background mt-16 flex flex-1">
        <section
          className="flex-1 overflow-auto p-10"
          onClick={() => setActiveFrameId(null)}
        >
          <div
            ref={workspaceRef}
            className="flex min-h-full items-center justify-center"
          >
            <div
              className="flex max-w-full items-center gap-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="">
                <div className="p-6">
                  <div
                    className="relative flex min-w-fit flex-shrink-0 items-stretch"
                    style={{
                      height: renderHeight ? `${renderHeight}px` : "55vh",
                      aspectRatio: `${totalSpan * settings.aspectRatio}`,
                    }}
                  >
                    <div
                      className="absolute inset-0 transition-colors"
                      style={{ backgroundColor: settings.bgColor }}
                    />

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleFrameReorder}
                    >
                      <SortableContext
                        items={frameIds}
                        strategy={horizontalListSortingStrategy}
                      >
                        {frames.map((frame, index) => {
                          const frameOffset = frameOffsets[index] ?? 0;
                          const frameWidth = frame.span * FRAME_WIDTH;
                          const rect = getFrameRect(
                            frameOffset,
                            frameWidth,
                            index,
                            frames.length,
                            settings,
                          );
                          const isActive = activeFrameId === frame.id;
                          const slideStart = Math.round(
                            frameOffset / FRAME_WIDTH + 1,
                          );
                          const slideEnd = slideStart + frame.span - 1;
                          const slideLabel =
                            frame.span === 1
                              ? `Slide ${slideStart}`
                              : `Slides ${slideStart}-${slideEnd}`;

                          return (
                            <SortableFrame
                              key={frame.id}
                              frame={frame}
                              rect={rect}
                              totalWidth={totalWidth}
                              totalHeight={totalHeight}
                              totalSpan={totalSpan}
                              slideLabel={slideLabel}
                              isActive={isActive}
                              onSelect={setActiveFrameId}
                              onRemove={removeFrame}
                              onUpload={triggerUpload}
                              onSetSpan={setFrameSpan}
                            >
                              {frame.images.length === 0 ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => triggerUpload(frame.id)}
                                  className="border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-primary flex h-full w-full items-center justify-center rounded-none border border-dashed transition"
                                >
                                  <div className="flex flex-col items-center gap-2 text-sm font-medium">
                                    <ImageIcon size={20} />
                                    Add Images
                                  </div>
                                </Button>
                              ) : (
                                renderFrameContent(frame)
                              )}
                            </SortableFrame>
                          );
                        })}
                      </SortableContext>
                    </DndContext>

                    {settings.showGuides &&
                      Array.from({
                        length: Math.max(totalSlides - 1, 0),
                      }).map((_, index) => (
                        <div
                          key={`guide-${index}`}
                          className="pointer-events-none absolute inset-y-0 border-l border-dashed border-neutral-500"
                          style={{
                            left: `${((index + 1) / totalSlides) * 100}%`,
                          }}
                        >
                          <div className="absolute bottom-2 left-1 rounded bg-neutral-500 px-1 py-0.5 font-mono text-[10px] text-white">
                            CUT {index + 1}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={addFrame}
                className="border-border bg-card text-muted-foreground hover:border-muted hover:bg-muted flex w-12 flex-shrink-0 items-center justify-center rounded-lg border border-dashed transition"
                style={{ height: renderHeight ? `${renderHeight}px` : "55vh" }}
              >
                <Plus />
              </Button>
              {/* just a space filler since padding is unavailable */}
              <div className="h-2 w-36">
                <span className="text-background">.</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="border-border bg-card flex w-80 flex-shrink-0 flex-col border-l px-6 py-8">
          <div className="sticky top-8 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Controls
              </span>
              <Button
                type="button"
                size="sm"
                onClick={handleExport}
                className="flex items-center gap-2"
              >
                <Download size={14} /> Export All
              </Button>
            </div>

            <div className="flex flex-col gap-6">
              <section>
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Aspect Ratio
                </h3>
                <div className="mt-3 flex flex-col gap-3">
                  {ASPECT_RATIO_GROUPS.map((group) => (
                    <div key={group.labelKey} className="flex flex-col gap-1.5">
                      <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                        {t(group.labelKey)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {group.ratios.map((ratio) => (
                          <Button
                            key={ratio.label}
                            type="button"
                            size="sm"
                            variant={
                              settings.aspectRatio === ratio.value
                                ? "default"
                                : "secondary"
                            }
                            onClick={() =>
                              setSettings((prev) => ({
                                ...prev,
                                aspectRatio: ratio.value,
                              }))
                            }
                          >
                            {ratio.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="text-muted-foreground flex items-center justify-between text-xs font-semibold tracking-wide uppercase">
                  <span>Padding</span>
                  <span>{settings.padding}px</span>
                </div>
                <Slider
                  min={0}
                  max={152}
                  step={8}
                  value={[settings.padding]}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      padding: value[0] ?? prev.padding,
                    }))
                  }
                  className="mt-2"
                />
              </section>

              <section className="flex items-start gap-3">
                <Checkbox
                  id="fit-images"
                  checked={settings.fitImages}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      fitImages: checked === true,
                      peekAmount: checked === true ? 0 : prev.peekAmount,
                    }))
                  }
                  aria-describedby="fit-images-description"
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="fit-images"
                    className="text-muted-foreground cursor-pointer text-xs font-semibold tracking-wide uppercase"
                  >
                    {t("fitImages")}
                  </label>
                  <p
                    id="fit-images-description"
                    className="text-muted-foreground text-[10px]"
                  >
                    {t("fitImagesDescription")}
                  </p>
                </div>
              </section>

              <section>
                <div className="text-muted-foreground flex items-center justify-between text-xs font-semibold tracking-wide uppercase">
                  <span className="flex items-center gap-1">
                    <PanelLeft size={12} />
                    Peek Offset
                  </span>
                  <span>{settings.peekAmount}px</span>
                </div>
                <Slider
                  min={0}
                  max={192}
                  step={16}
                  disabled={settings.fitImages}
                  value={[settings.peekAmount]}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      peekAmount: value[0] ?? prev.peekAmount,
                    }))
                  }
                  className="mt-2"
                />
              </section>

              <section>
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Background Color
                </h3>
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {COLORS.map((color) => (
                    <Button
                      key={color}
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setSettings((prev) => ({ ...prev, bgColor: color }))
                      }
                      className={`border-border h-7 w-7 rounded-full border p-0 transition ${
                        settings.bgColor === color ? "ring-ring ring-1" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </section>

              <section className="flex items-center justify-between">
                <div>
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Guides
                  </h3>
                  <p className="text-muted-foreground text-[10px]">
                    Show Instagram cut markers
                  </p>
                </div>
                <Button
                  type="button"
                  variant={settings.showGuides ? "default" : "secondary"}
                  size="icon"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      showGuides: !prev.showGuides,
                    }))
                  }
                  className="rounded-lg p-2"
                >
                  <Scissors size={16} />
                </Button>
              </section>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default InstagramPostBuilderPage;
