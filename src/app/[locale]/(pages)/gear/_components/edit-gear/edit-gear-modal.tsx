"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import type { Locale } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";
import { useUnsavedChangesGuard } from "~/lib/hooks/useUnsavedChangesGuard";
import { translateGearDetailWithFallback } from "~/lib/i18n/gear-detail";
import type { GearItem, GearType } from "~/types/gear";
import EditModalContent from "./edit-modal-content";
import {
  handleGearEditSubmissionSuccess,
  type GearEditSubmissionSuccess,
} from "./edit-gear-navigation";

interface EditGearModalProps {
  canToggleAutoSubmit?: boolean;
  gearType?: GearType;
  gearData: GearItem;
  gearSlug: string;
  gearName: string;
  initialShowMissingOnly?: boolean;
}

export function EditGearModal({
  canToggleAutoSubmit = false,
  gearType,
  gearData,
  gearSlug,
  gearName,
  initialShowMissingOnly,
}: EditGearModalProps) {
  const t = useTranslations("gearDetail");
  const tf = (key: string, fallback: string) =>
    translateGearDetailWithFallback(t, key, fallback);
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [showMissingOnly] = useState(Boolean(initialShowMissingOnly));
  const {
    cancelLeave,
    confirmLeave,
    isConfirmOpen,
    navigateAfterHistoryTrap,
    requestLeave,
  } = useUnsavedChangesGuard({
    interceptHistory: true,
    interceptLinks: true,
    isDirty,
    navigate: (href) => router.push(href),
  });

  const closeToGear = useCallback(() => {
    setIsOpen(false);
    navigateAfterHistoryTrap(() =>
      router.replace(localizePathname(`/gear/${gearSlug}`, locale as Locale)),
    );
  }, [gearSlug, locale, navigateAfterHistoryTrap, router]);

  const requestClose = useCallback(
    (opts?: { force?: boolean }) => {
      requestLeave(closeToGear, opts);
    },
    [closeToGear, requestLeave],
  );

  const handleSubmitSuccess = useCallback(
    (result: GearEditSubmissionSuccess) => {
      setIsOpen(false);
      handleGearEditSubmissionSuccess({
        result,
        closeToGear: () =>
          navigateAfterHistoryTrap(() =>
            router.replace(
              localizePathname(`/gear/${gearSlug}`, locale as Locale),
            ),
          ),
        navigateToSuccess: (href) =>
          navigateAfterHistoryTrap(() =>
            router.replace(localizePathname(href, locale as Locale)),
          ),
      });
    },
    [gearSlug, locale, navigateAfterHistoryTrap, router],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        requestClose();
      }
    },
    [requestClose],
  );

  const isEditRoute = pathname.endsWith(`/gear/${gearSlug}/edit`);

  return (
    <Dialog open={isOpen && isEditRoute} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 sm:max-w-4xl" showCloseButton={false}>
        <EditModalContent
          canToggleAutoSubmit={canToggleAutoSubmit}
          gearType={gearType}
          gearData={gearData}
          gearSlug={gearSlug}
          gearName={gearName}
          onDirtyChange={setIsDirty}
          onRequestClose={requestClose}
          onSubmitSuccess={handleSubmitSuccess}
          initialShowMissingOnly={showMissingOnly}
          formId="edit-gear-form"
        />
      </DialogContent>
      {/* Unsaved changes confirmation */}
      <AlertDialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open) cancelLeave();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tf("editGear.discardTitle", "Discard unsaved changes?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tf(
                "editGear.discardDescription",
                "You have unsaved changes. If you exit now, your edits will be lost.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLeave}>
              {tf("editGear.stay", "Stay")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>
              {tf("editGear.discardAndExit", "Discard & Exit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
