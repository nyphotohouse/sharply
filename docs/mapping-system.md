# Mapping System Technical Overview

## Overview

The mapping system provides utilities to convert database values into human-readable display names. It's designed to be simple, maintainable, and type-safe.

## Architecture

```
src/lib/mapping/
├── index.ts              # Main export file
├── mounts-map.ts         # Mount type transformations
├── lens-aperture-map.ts  # Aperture formatting (new)
├── shutter-types-map.ts  # Shutter type labels/formatting
└── price-map.ts          # Price formatting utilities
```

Price selection is intentionally outside this formatting folder. The pure
fallback policy and structured result live in
`src/lib/pricing/display-price.ts`; `price-map.ts` adapts that result to the
existing string-based card/detail contracts.

## Core Functions

### Mount Mappings (`mounts-map.ts`)

#### `getMountDisplayName(mountValue: string | null | undefined): string`

- **Purpose**: Converts mount values to short, compact display names
- **Logic**: Splits on dash, takes first part, uppercases
- **Examples**:
  - `"z-nikon"` → `"Z"`
  - `"rf-canon"` → `"RF"`
  - `"e-sony"` → `"E"`

#### `getMountLongName(mountValue: string | null | undefined): string`

- **Purpose**: Converts mount values to descriptive, full names
- **Logic**: Splits on dash, formats as "MOUNT - Brand"
- **Examples**:
  - `"z-nikon"` → `"Z - Nikon"`
  - `"rf-canon"` → `"RF - Canon"`
  - `"e-sony"` → `"E - Sony"`

### Price Formatting (`price-map.ts`)

#### `formatPrice(priceCents: number | null | undefined, options?): string`

- **Purpose**: Converts price in cents to readable currency string
- **Input validation**: Accepts only finite integer cent values. Fractional numbers or strings such as `"2029.5"` are treated as invalid and fall back.
- **Options**:
  - `style` (`"long"` | `"short"`): `"long"` appends `USD` (detail views), `"short"` omits the suffix (cards/badges).
  - `padWholeAmounts` (`boolean`): Forces trailing `.00` for whole-dollar values so lists/tables stay aligned.
- **Logic**: Divides by 100, formats with dollar sign and locale-aware number formatting
- **Examples**:
  - `formatPrice(324900)` → `"$3,249 USD"`
  - `formatPrice(159695, { style: "short" })` → `"$1,596.95"`
  - `formatPrice(249900, { style: "short", padWholeAmounts: true })` → `"$2,499.00"`

## Usage Patterns

### Basic Import

```typescript
import {
  getMountDisplayName,
  getMountLongName,
  formatPrice,
  formatApertureRange,
  formatLensApertureDisplay,
} from "~/lib/mapping";
import { getDisplayPrice } from "~/lib/pricing/display-price";
```

### Mount Display Examples

```typescript
// Compact display (badges, labels)
<span>{getMountDisplayName(item.mount)}</span>

// Detailed display (tooltips, descriptions)
<span>{getMountLongName(item.mount)}</span>
```

### Price Display Examples

```typescript
// Simple price formatting
<div>{formatPrice(item.priceUsdCents)}</div>

// Resolve the shared policy before formatting when a gear item has the new
// used-price projection.
const price = getDisplayPrice(item, { market: "US", range: false });
```

### Lens Aperture Formatting (`lens-aperture-map.ts`)

#### `formatApertureRange(wide: number | null | undefined, tele: number | null | undefined): string`

- **Purpose**: Formats a single or variable aperture as `f/2.8` or `f/5.6 - 6.3`
- **Logic**: Trims trailing `.00` and unnecessary zeros; collapses equal ends to single
- **Examples**:
  - `(2.8, null)` → `"f/2.8"`
  - `(5.6, 6.3)` → `"f/5.6 - 6.3"`
  - `(4, 4)` → `"f/4"`

#### `formatLensApertureDisplay({ maxApertureWide, maxApertureTele, minApertureWide, minApertureTele })`

- **Purpose**: Returns `{ maxText, minText }` for "Maximum Aperture" and "Minimum Aperture" lines
- **Examples**:
  - `{ maxApertureWide: 4.5, minApertureWide: 16 }`
    → `{ maxText: "f/4.5", minText: "f/16" }`
  - `{ maxApertureWide: 5.6, maxApertureTele: 6.3, minApertureWide: 16, minApertureTele: 22 }`
    → `{ maxText: "f/5.6 - 6.3", minText: "f/16 - 22" }`

### Shutter Type Formatting (`shutter-types-map.ts`)

#### `formatShutterType(shutterType: string | null | undefined): string`

- **Purpose**: Converts shutter type identifiers (e.g., `"efc"`) into human-readable labels.
- **Logic**: Looks up identifiers in `SHUTTER_TYPE_LABELS` (mapping `"efc"` → `"Electronic Front-Curtain"`), falling back to simple capitalization when a label isn't present.
- **Examples**:
  - `"mechanical"` → `"Mechanical"`
  - `"efc"` → `"Electronic Front-Curtain"`
  - `"electronic"` → `"Electronic"`

## Design Principles

1. **Simple Logic**: No hardcoded mappings - uses string manipulation
2. **Null Safety**: Handles null/undefined values gracefully
3. **Type Safety**: Full TypeScript support with proper interfaces
4. **Consistent API**: Similar function signatures across all mappers
5. **Fallback Behavior**: Returns original value if transformation fails

## Analog Cameras and Fixed-Lens Mounts

- Analog camera enum strings are currently humanized inline (hyphen to spaces, title-case). Add dedicated mapping helpers if these values need richer labels.
- Integrated-lens cameras (digital or analog) share the `fixed-lens` mount value and the `fixed_lens_specs` table; continue to resolve `fixed-lens` through `mounts-map` for display/filters.

## Extensibility

To add new mapping types:

1. Create new mapping file (e.g., `lens-types-map.ts`)
2. Implement transformation functions
3. Export from `index.ts`
4. Update `getDisplayName()` utility function

## Error Handling

- **Null/undefined inputs**: Return "Unknown"
- **Malformed strings**: Return original value
- **Missing parts**: Graceful fallback to original value

## Performance Considerations

- **Lightweight**: Simple string operations, no complex lookups
- **No caching**: Functions are pure and stateless
- **Minimal dependencies**: Only uses built-in JavaScript methods

## Gear Name Display

Regional aliases are resolved through a single helper to keep UI consistent:

- **Helper**: `GetGearDisplayName(item)` in `src/lib/gear/naming.ts`
- **Inputs**: canonical `name` plus optional `regionalAliases`
- **Resolution**: country → region (GLOBAL/US/EU/JP), then exact alias match, else canonical; US does not inherit a `GLOBAL` alias
- **Usage**: all gear name surfaces should use the helper or `useGearDisplayName`

## Routing note: Mount shortName

The browse routing uses `mounts.short_name` as the URL segment for mount-level pages (e.g., `/browse/nikon/lenses/z`). Ensure `short_name` is unique per brand for clean URLs.

Mount-scoped popularity and Trending badge queries resolve membership through the canonical `gear_mounts` junction. They do not rely on the deprecated single `gear.mount_id` pointer, so multi-mount lenses participate in every applicable mount ranking.
