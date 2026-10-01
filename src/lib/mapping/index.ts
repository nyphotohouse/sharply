/**
 * Mapping utilities for converting database values to readable display names
 *
 * This module provides functions to convert various database values (like mount types,
 * gear types, sensor formats, etc.) into user-friendly display names.
 */

// Mount mappings
export { getMountDisplayName, getMountLongName } from "./mounts-map";

// Price formatting utilities
export {
  formatPrice,
  formatDisplayPrice,
  getItemDisplayPrice,
  normalizePriceCents,
  PRICE_FALLBACK_TEXT,
} from "./price-map";

// Dimensions formatting utilities
export {
  formatCardSlotDetails,
  summarizeCardSlots,
  titleizeCardEnum,
} from "./card-slots-map";
export { formatDimensions, formatLensDimensions } from "./dimensions-map";

// Camera type formatter
export { formatCameraType } from "./camera-type-map";

// Shutter type formatter
export { formatShutterType } from "./shutter-types-map";

// Lens aperture formatting
export {
  formatApertureRange,
  formatApertureSingle,
  formatLensApertureDisplay,
} from "./lens-aperture-map";

export {
  formatPrecaptureSupport,
  PRECAPTURE_SUPPORT_OPTIONS,
} from "./precapture-map";

// Import for use in this file
import { getMountDisplayName } from "./mounts-map";

/**
 * Utility function to get a human-readable name for any database value
 * @param value - The database value to convert
 * @param type - The type of value ("mount")
 * @returns The readable display name or the original value if no mapping exists
 */
export function getDisplayName(
  value: string | null | undefined,
  type: "mount",
): string {
  if (!value) return "Unknown";

  switch (type) {
    case "mount":
      return getMountDisplayName(value);
    default:
      return value;
  }
}
