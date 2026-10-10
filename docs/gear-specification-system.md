# Gear Specification System

## Overview

The gear specification system uses a flexible subtable approach to store detailed specifications for different types of gear items. This design allows for type-specific data while maintaining a clean, normalized database structure.

## Architecture

### Color variations

Colorways are optional visual variants attached to a gear identity, not separate specification records. The ordered `gear_colorways` relationship and image-source rules are documented in [gear-images/color-variations.md](./gear-images/color-variations.md).

### Core Tables

#### `gear` - Main Gear Table

The central table that stores common gear information:

- **Basic Info**: ID, slug, name, search name
- **Classification**: Gear type (CAMERA, LENS)
- **Brand & Mount**: References to brands and mounts
  - `mountId`: Single mount reference (kept for backward compatibility, stores "primary" mount)
  - Mount relationships managed via `gear_mounts` junction table for multi-mount support
- **Metadata**: Announced, release, and discontinued dates with precision; MSRP compatibility fields and legacy MPB compatibility price; thumbnail URL; optional stored Open Graph URL; optional top-view URL; optional rear-view URL; and optional camera side-view URLs
  - `thumbnailUrl` applies to all gear
  - `ogImageUrl` stores a precomputed padded social-preview image derived from the front thumbnail, or from a lens orthographic image when no front image exists
  - `topViewUrl` applies to cameras and lenses; lens UI labels this as "Orthographic"
  - Public cards and social metadata use a lens `topViewUrl` as a fallback only when `thumbnailUrl` is absent; camera secondary views are not fallbacks
  - `rearViewUrl` applies only to `CAMERA` and `ANALOG_CAMERA`
  - `leftViewUrl` and `rightViewUrl` apply only to `CAMERA` and `ANALOG_CAMERA`
- **Publication State**: `publicationState` controls whether the item is publicly visible
  - `PUBLISHED`: normal public gear page and discovery behavior
  - `RUMORED`: hidden from browse/search/feed/sitemap discovery, but still reachable by direct `/gear/[slug]` where it renders a pre-release placeholder page
  - `HIDDEN`: emergency off switch; hidden from all public surfaces and direct public gear URLs return 404
  - Indexed in the `gear` table to support public browse/search/trending/popularity filters
- **User Notes**: `notes` — `text[]` for unstructured notes
- **Commerce**: `mpbMaxPriceUsdCents` remains available for MPB-specific compatibility/fallback behavior. Source mappings, observations, estimates, projections, public display policy, and scheduled-fetch observability are documented in [`prices/`](./prices/) and summarized in [`used-price-system.md`](./used-price-system.md)
- **Core Specs**: Physical dimensions (width, height, depth in mm), weight, and optional product lineage
  - `predecessorGearId` and `successorGearId` are nullable same-type self-references for the prior and next model respectively.
  - Editor relationship management keeps the two directions reciprocal. Deleting a referenced gear item sets the corresponding lineage field to `null`.
- **Timestamps**: Created/updated tracking

### Publication State vs. Completeness

Sharply now tracks two separate concepts on gear items:

- **Publication state** decides whether the item is publicly discoverable at all.
- **Completeness / under construction** decides whether a published item should show the normal detail page or the under-construction placeholder.

Rules:

- `RUMORED` is a manual override. If an item is rumored, the public gear page shows the rumored placeholder even when the item is also incomplete.
- `HIDDEN` fully removes the item from public access and discovery.
- The `/lists/under-construction` surface is only for incomplete **published** items.
- Its catalog-completion disclosure compares completed published items with the total catalog, with the same completed/total progress available for every configured brand.
- Item names on the under-construction list link to their public gear pages. Each row reports uploaded default-view images against the supported slot count (five for cameras, two for lenses), and the image filter selects only rows with zero uploaded images. Row actions are revealed on hover, keyboard focus, or a non-interactive touch target; contributors can open the missing-spec editor, while editors and higher roles can also open image management.
- The homepage contribution banner links through `/contribute/random`, which chooses from the same under-construction pool and falls back to one of the 20 least-complete published items when that pool is empty.
- Editors can still use normal admin and edit surfaces to prefill specs, images, and manuals on rumored or hidden items before publication.

#### `gear_aliases` - Regional Display Names

Stores alternate consumer-facing names used in specific regions (aliases, not localization):

- **Primary Key**: Composite (`gearId`, `region`) to enforce one alias per region
- **Gear Reference**: Foreign key to `gear.id` (cascade on delete)
- **Region**: `gear_region` enum (`GLOBAL`, `US`, `EU`, `JP`)
- **Name**: Complete alternate display name for that region, stored without canonical-brand prefix enforcement
- **Use Cases**:
  - Canon "Kiss" line in Japan
  - Canon EU variants (secondary)
  - Rokinon branding for Samyang products in the United States
- **Search**: Aliases are denormalized into `gear.search_name` for query performance

#### `tags` and `gear_tags` - Editorial Discovery Labels

Tags supplement structured specifications with editor-managed discovery labels.
`gear_tags` is a unique many-to-many junction, so a gear item can have many
tags without duplicate assignments.

- **Public content**: A tag can include a short description, public page title,
  public page content, and an optional Lucide icon name for the dictionary,
  tag page, and gear tag chip.
- **Visibility**: `tags.unlisted` defaults to `false`. Editor-created tags are
  forced unlisted; administrators control publication. Public dictionary and
  tag-page queries exclude unlisted tags.
- **Private content**: Visibility state is never selected by public or editor
  tag queries. Internal notes are never public, but are available to editors
  as assignment guidance.

#### `gear_exif_aliases` - EXIF Metadata Model Aliases

Stores EXIF-oriented make/model identifiers used to map uploaded metadata back to a canonical gear item.

- **Purpose**:
  - map EXIF model strings to `gear`
  - keep metadata identifiers separate from camera specs and regional display aliases
- **Examples**:
  - `NIKON CORPORATION` + `Zf`
  - `Canon` + `Canon EOS R5`
- **Important**:
  - this table is for metadata matching, not for public display naming
  - this is intentionally separate from `camera_specs`; EXIF model names are external identifiers, not specifications

#### `gear_mounts` - Gear-Mount Junction Table

Many-to-many relationship table for gear that supports multiple mounts (e.g., third-party lenses available in multiple mounts):

- **Primary Key**: Composite (`gearId`, `mountId`)
- **Gear Reference**: Foreign key to `gear.id` (cascade on delete)
- **Mount Reference**: Foreign key to `mounts.id` (restrict on delete)
- **Use Cases**:
  - Lenses: Can have multiple compatible mounts (e.g., Sigma lenses in Canon RF, Nikon Z, Sony E)
  - Cameras: Typically have single mount (use `gear.mountId` for backward compatibility)
- **Indexes**: Indexed on both `gearId` and `mountId` for efficient lookups

Admin CSV bulk import accepts mount identifiers using `mounts.value` strings,
such as `z-nikon` or `e-sony`, separated with `|` or `;`. The importer resolves
those values to `mounts.id`, writes all matches to `gear_mounts`, and keeps the
first mount mirrored in the deprecated `gear.mountId` compatibility column.

#### `cameraSpecs` - Camera Specifications

Stores detailed camera-specific specifications:

- **Primary Key**: `gearId` (1:1 relationship with gear)
- **Sensor**: Format reference, resolution in megapixels
- **Performance**: native ISO range (`isoMin`/`isoMax`), optional expanded ISO bounds (`isoMinExpanded`/`isoMaxExpanded`, stored as `iso_min_expanded`/`iso_max_expanded`), and native base ISO values (`baseIso`, stored as the nullable, unrestricted `base_iso` integer array), plus IBIS, available shutter types, and viewfinder type. Base ISO values are positive integers stored uniquely in ascending order and displayed with `/` separators. The editor currently caps entry at three values; expanded and base ISO values do not affect native ISO search filters. In missing-only editor mode, IBIS remains editable when its value is explicitly `true` or `false`, but the control is hidden for digital cameras whose camera type is DSLR. Analog cameras use a separate specification editor and do not expose IBIS.
- **Focus**: `hasAutofocus` is nullable so unknown capability is distinct from a confirmed absence. When it is explicitly `false`, autofocus-specific detail rows (focus points, AF area modes, AF subject categories, and focus bracketing) are hidden; stored values are retained for a future correction. The edit form keeps those controls visible but disabled unless autofocus is explicitly `true`, while the edit sidebar hides them when autofocus is `false`.
- **Burst rate**:
  - `max_fps_by_shutter` (JSONB, nullable) stores per-shutter continuous FPS for RAW/JPG. Keys: `mechanical`, `efc`, `electronic` with `{ raw, jpg }` numeric values.
  - Headline `max_fps_raw` and `max_fps_jpg` mirror the maximum RAW/JPG values across the JSON object for backward compatibility.
- **Precapture**: `precaptureSupportLevel` (`integer`, null allowed) tracks buffer support
  - `0`: No precapture buffer
  - `1`: Yes (RAW)
  - `2`: Yes (JPEG only)
- **Displays**: rear display type (none, fixed, single_axis_tilt, dual_axis_tilt, fully_articulated, four_axis_tilt_flip, other), rear display size (inches), rear display resolution (million dots), has top display, has rear touchscreen
- **Viewfinder**: type (none/optical/electronic/hybrid/other), magnification (x), eye point (millimeters), resolution (million dots). Eye point is nullable and only applies when the viewfinder type is known and not `none`. Resolution applies only to electronic viewfinders.
- **Video**: `hasVideo` is nullable to distinguish unknown support from confirmed availability or absence. Editors can change the dependent video capabilities and mode matrix only when it is `true`; `null` keeps legacy stored video details visible publicly, while `false` hides all dependent video details without deleting them. The mode matrix (`camera_video_modes`) and dependent capability flags cover log profile, 10-bit, 12-bit, open gate, external recording, and recording to a drive.
- **Misc**: capture convenience and body feature flags such as built-in flash, hot shoe, illuminated buttons, intervalometer, self timer, and USB file transfer
- **Flexibility**: JSONB extra field for additional specs

#### `analogCameraSpecs` - Analog Camera Specifications

Stores detailed analog-camera-specific specifications:

- **Primary Key**: `gearId` (1:1 relationship with gear)
- **Exposure / operation**: shutter, metering, exposure, ISO, focus-assist, and battery requirements
- **Viewfinder**: type and optional eye point in millimeters. Eye point is only editable and displayed for a known, non-`none` viewfinder type.
- **Continuous drive**: `hasContinuousDrive` plus `max_continuous_fps` stored as decimal `numeric(4,1)` so fractional drive rates such as `3.5 fps` can be preserved
- **Display**: continuous-drive FPS renders compactly, so round values show as `3 FPS` rather than `3.0 FPS`

#### `lensSpecs` - Lens Specifications

Stores detailed lens-specific specifications:

- **Primary Key**: `gearId` (1:1 relationship with gear)
- **Focal Length**: Minimum and maximum focal length in mm (decimal, 0.1mm precision)
- **Image Circle**: `imageCircleSizeId` references `sensor_formats.id` to capture coverage (e.g., full frame, APS-C)
- **Aperture**: Maximum aperture value plus optional `apertureProfileJson`, an
  ordered JSON array of `{ focalLength, aperture }` points for
  variable-aperture zoom lenses. The first and last points mirror the canonical
  focal-length and maximum-aperture endpoints; intermediate points record
  aperture changes within the zoom range. Prime and constant-aperture lenses
  leave this field `null`. Prime lenses also leave the tele-end maximum and
  minimum aperture fields `null` because they have no zoom range.

Creation flows validate camera resolution and lens/fixed-lens aperture values as
numbers, then pass typed decimal-string inputs to the database without changing
the database representation.

- **Stabilization**: Whether the lens has stabilization
- **Flexibility**: JSONB extra field for additional specs

Admin CSV bulk import can create the initial lens spec row with mapped values.
Duplicate review checks for editable bulk-import rows are debounced per row so
typing remains uninterrupted, and superseded checks are discarded.
The lens-oriented template includes `imageCircleSize`, which accepts a sensor
format slug, id, or exact name and stores the resolved `sensor_formats.id`.
Focal length, prime/zoom (`isPrime`), and maximum aperture are not CSV columns;
the importer always infers them from conventional lens names such as
`60mm f/2.8`, `24-70mm F2.8`, `50mm 1:2.8`, `f/4.5-6.3`, or cine `T2.9` /
`T/2.1`. Link and notes columns are also omitted from bulk import (edit those
after create).

Admins can backfill the same missing optics on existing lenses via
`/admin/tools` (Lens Optics Backfill): scans incomplete LENS rows in batches of
25–50, proposes high-confidence name parses, and applies only null fields after
manual review.

#### `fixed_lens_specs` - Integrated Lens Specifications (Cameras)

For cameras that use the `fixed-lens` mount, a simplified lens spec table stores the integrated lens details:

- Primary Key: `gearId` (1:1 with `gear`)
- Fields:
  - `isPrime` (boolean)
  - `focalLengthMinMm` (decimal, 0.1mm precision), `focalLengthMaxMm` (decimal, 0.1mm precision)
  - `maxApertureWide` (decimal), `maxApertureTele` (decimal)
  - `minApertureWide` (decimal), `minApertureTele` (decimal)
  - `imageCircleSizeId` references `sensor_formats.id` to describe coverage for equivalent focal-length calculations and editing workflows; integrated-lens gear pages do not render it as a separate spec row
  - `hasAutofocus` (boolean)
  - `minimumFocusDistanceMm` (int)
  - `frontElementRotates` (boolean)
  - `frontFilterThreadSizeMm` (int)
  - `hasLensHood` (boolean)

UI: On the edit form, when the Mount is `fixed-lens` (via `mountIds[0]` or `mountId`), an "Integrated Lens" section appears, reusing the same focal length and aperture inputs as standalone lens editing.

Rendering: On gear pages for cameras with `fixed-lens`, a dedicated "Integrated Lens" specs section is displayed. Focal length can use the integrated lens image-circle value for equivalent focal-length math, but Image Circle Size is hidden as its own row because the camera sensor format already describes the relevant capture area.

#### Supporting Editorial Tables

Gear pages can also include curated supporting editorial data that is separate
from the specifications registry itself.

- `staff_verdicts`: Sharply-authored editorial summaries for a gear item
- `approved_creators`: Admin-managed allowlist of creator sources
- `gear_creator_videos`: Gear-linked curated videos from approved creators only

The creator video system is documented in
[`docs/respected-creators-videos.md`](./respected-creators-videos.md).

## Database Schema

The system uses three main tables with the following structure:

```sql
-- Core gear table with common fields
CREATE TABLE sharply_gear (
  -- Primary key and identifiers
  -- Basic information (name, slug, search name)
  -- Classification (gear type, brand, mount)
  -- Metadata (announced/release/discontinued dates + precision, price, thumbnail, top/rear secondary images)
  -- Timestamps
);

-- Camera specifications table
CREATE TABLE sharply_camera_specs (
  -- Primary key referencing gear table
  -- Sensor-related specifications
  -- Performance specifications
  -- Video capabilities
  -- Flexible extra data field
  -- Timestamps
);

-- Lens specifications table
CREATE TABLE sharply_lens_specs (
  -- Primary key referencing gear table
  -- Optical specifications
  -- Mechanical features
  -- Flexible extra data field
  -- Timestamps
);
```

## Relationships

### One-to-One Relationships

- Each gear item has exactly one set of specifications
- Camera gear → `cameraSpecs`
- Lens gear → `lensSpecs`
- Enforced by primary key constraints on `gearId`

### Foreign Key Relationships

- **Gear → Brands**: Required relationship (restrict delete)
- **Gear → Mounts**: Optional relationship (set null on delete)
- **Gear → Gear lineage**: Optional predecessor and successor self-references (set null on delete); application services maintain reciprocal same-type links.
- **Gear Creator Videos → Approved Creators**: Required relationship (restrict delete)
- **Camera Specs → Sensor Formats**: Optional relationship (set null on delete)
- **Lens Specs → Sensor Formats** (`imageCircleSizeId`): Optional relationship at the DB level (set null on delete), but treated as a required completeness spec for published lenses because it drives coverage-dependent behavior such as Sony FE vs Sony E MPB routing.
- **Fixed-lens Specs → Sensor Formats** (`imageCircleSizeId`): Optional relationship (set null on delete)

### Cascade Behavior

- Deleting a gear item automatically removes its specifications
- Deleting a sensor format sets the reference to null in camera specs

## Data Types & Constraints

### Numeric Precision

- **Resolution**: High precision for megapixel values
- **Focal Length**: Stored as `decimal(5,1)` to capture 0.1mm precision for lenses and fixed-lens cameras
- **Aperture**: Standard aperture scale precision

### Text Fields

- **Names & Slugs**: Limited lengths for performance
- **Search Name**: Lowercase for efficient LIKE queries and trigram searches
- **Video Resolution**: Free-form text for various format specifications

### JSONB Extra Field

The `extra` field provides flexibility for storing additional specifications without schema changes:

```json
{
  "weatherSealing": true,
  "filterThread": "67mm",
  "weight": "450g"
  // Note: dimensions moved to core `gear` table as numeric fields
}
```

## Spec Registry System

### Overview

The spec registry (`src/lib/specs/registry.tsx`) centralizes all gear specification display logic, providing a single source of truth for labels, formatting, section organization, and registry-owned fallback copy.

### Key Benefits

- **Single Source of Truth**: All spec labels and formatting logic in one place
- **Consistent Display**: Same formatting across gear pages, compare views, and future surfaces
- **Easy Maintenance**: Adding new specs requires updating only the registry
- **Type Safety**: Uses `GearItem` type for consistent data access

### Registry Structure

The registry exports `buildGearSpecsSections(item: GearItem, options?)` which returns `SpecsTableSection[]`. Each section carries a stable `id`, localized `title`, and a `data` array of rows with stable `key`, localized `label`, and display `value`:

```tsx
// Example registry entry
{
  label: "Resolution",
  value: cameraSpecsItem?.resolutionMp
    ? `${Number(cameraSpecsItem.resolutionMp).toFixed(1)} megapixels`
    : undefined,
},
```

### Usage

- **Gear Pages**: `buildGearSpecsSections(item)` replaces inline spec definitions
- **Compare Views**: `CompareSpecsTable` component reuses the same registry
- **Future Surfaces**: Any new spec display can import and use the registry
- **Intentional Exceptions**: Editor-managed resource links such as `gear.linkInstructionManual` may live on the core `gear` table while rendering outside the spec table and outside the public suggestion flow.
- **Display Conditions**: Prefer field-level `condition` functions for sentinel values that should not render at all. Example: `internalStorageGb` only renders when the numeric value is greater than `0`, so `0` does not show as a misleading graph/spec entry.
- **Missing-only Editor Mode**: Fields with `alwaysShowInEditor: true` remain editable even when they already have a value. Use this only for capability toggles whose current `false` value would otherwise lock their dependent editor fields.
- **Completed-spec edit policy**: Construction completeness and contributor permissions are separate. Regular contributors may fill a missing construction-critical spec, but may not replace or clear it after its completion group is filled; `EDITOR` and higher roles may always edit it. The shared policy is `src/lib/gear/completed-spec-edit-policy.ts`, and coupled fields such as focal length lock only after the full group is complete.

### Localization

- English labels and section titles remain inline in `registry.tsx` as the source of fallbacks.
- Registry keys are written as `specRegistry.*` relative to the `gearDetail` translator (scoped keys).
- The full JSON path used in locale files is `gearDetail.specRegistry.*`.
- Examples: field labels under `gearDetail.specRegistry.sections.<sectionId>.fields.<fieldKey>.label` and shared values under `gearDetail.specRegistry.shared.*`.
- The registry will fall back to inline English when a locale key is missing; `registry.tsx` provides these inline English labels as the fallback source.
- Shared simple values emitted directly by the registry, such as `Yes` and `No`, live under `gearDetail.specRegistry.shared.*`.
- Contributor submission previews and admin approval views should also reuse `gearDetail.specRegistry.shared.*` for shared simple values like `Yes` and `No` instead of introducing separate namespaces.
- Edit-form chrome and workflow copy that is not owned by the registry lives under `gearDetail.editGear.*`.
- Keep canonical English labels inline in registry/edit code where they are the source of truth, then resolve localized UI labels via translation keys. This keeps the English terminology searchable in code while preventing those labels from leaking into non-English UI.
- Review/use-case genre labels on gear surfaces are resolved by slug under `gearDetail.reviewGenres.*`; do not render the generated English `GENRES[].name` directly in non-English UI.

**Max Continuous FPS display**

- Uses `max_fps_by_shutter` to render one line per available shutter type when multiple shutters exist (e.g., `Mechanical: Raw 20 fps, JPG 15 fps`).
- When only one shutter type is available, values are flattened inline (e.g., `20 fps (Raw), 120 fps (JPG)` or `14 fps` when equal).
- Falls back to `max_fps_raw` / `max_fps_jpg` when per-shutter JSON is missing.

### Adding New Specs

1. Add field to database schema
2. Add entry to spec registry with inline English label/value formatting and confirm its translation key path
3. Add matching `gearDetail.specRegistry` keys to every locale file
4. Field automatically appears in appropriate section

### Notes Field

- Schema: `gear.notes` (`text[]`), stores an array of strings
- Normalization: Input via edit form is validated and trimmed to `string[]` (`null` clears notes)
- UI: A "Notes" section appears at the bottom of the edit form with a repeater allowing users to add/remove note items. Each item is a textarea. Users click "+ Add note" to create a new note.
- Submission Preview: Notes are included in the confirmation modal; items are summarized inline.

## Indexing Strategy

### Performance Indexes

- **Gear Search**: Index on search name for text search
- **Type & Brand**: Composite index for filtering by gear type and brand
- **Brand & Mount**: Index for mount compatibility queries
- **Camera Sensor**: Index for sensor format lookups
- **Lens Focal**: Index for focal length range queries

### Query Optimization

Indexes are designed to support common use cases:

- Finding all cameras by a specific brand
- Searching for lenses within a focal length range
- Filtering gear by mount compatibility
- Full-text search across gear names

## Usage Examples

### Creating a Camera with Specs

```typescript
// Insert gear item
const [camera] = await db
  .insert(gear)
  .values({
    slug: "canon-eos-r5",
    searchName: "canon eos r5",
    name: "Canon EOS R5",
    gearType: "CAMERA",
    brandId: "canon-brand-id",
    mountId: "rf-mount-id",
    priceUsdCents: 389900,
  })
  .returning();

// Insert camera specifications
await db.insert(cameraSpecs).values({
  gearId: camera.id,
  sensorFormatId: "full-frame-id",
  resolutionMp: 45.0,
  isoMin: 100,
  isoMax: 51200,
  ibis: true,
  videoMaxRes: "8K RAW",
  extra: { weatherSealing: true, dualCardSlots: true },
});
```

### Querying Gear with Specs

```typescript
// Get camera with full specifications
const cameraWithSpecs = await db.query.gear.findFirst({
  where: eq(gear.slug, "canon-eos-r5"),
  with: {
    cameraSpecs: true,
    brand: true,
    mount: true,
  },
});

// Find all full-frame cameras
const fullFrameCameras = await db
  .select()
  .from(gear)
  .innerJoin(cameraSpecs, eq(gear.id, cameraSpecs.gearId))
  .innerJoin(sensorFormats, eq(cameraSpecs.sensorFormatId, sensorFormats.id))
  .where(eq(sensorFormats.slug, "full-frame"));
```

## Benefits of This Design

### 1. **Type Safety**

- Clear separation between camera and lens specifications
- Type-specific fields prevent invalid data combinations

### 2. **Flexibility**

- JSONB extra field allows for future specification additions
- Easy to add new gear types without schema changes

### 3. **Performance**

- Efficient indexing for common query patterns
- Normalized structure reduces data duplication

### 4. **Maintainability**

- Clear separation of concerns
- Easy to understand and modify

### 5. **Scalability**

- Supports large numbers of gear items
- Efficient queries with proper indexing

## Future Considerations

### Adding New Gear Types

To add a new gear type (e.g., tripods, lighting):

1. Add new enum value to `gearTypeEnum`
2. Create new specification table (see below)
3. Add relationship to `gearRelations`
4. Update application logic

#### Example: Analog Cameras

- `gear_type` includes `ANALOG_CAMERA`.
- Specs live in `analog_camera_specs` (1:1 on `gear.id`); integrated lenses still use `fixed_lens_specs` shared with digital cameras.
- Under-construction rule: analog items are incomplete when `mount`, `cameraType`, or `captureMedium` are missing (plus fixed-lens focal length when the mount is `fixed-lens`).
- Under-construction rule: lenses are incomplete when key catalog specs are missing, including focal length, prime/zoom state, max aperture, and `imageCircleSizeId` coverage.
- Update data/service fetchers, edit/admin payloads, and the specs registry to treat analog cameras like digital cameras for integrated-lens display while using their own spec table.

### Admin Workflow Notes

- Staff can create gear directly as `PUBLISHED`, `RUMORED`, or `HIDDEN`.
- The single-item creation modal uses two steps: identity first, then optional
  type-specific completeness fields. All gear can select a mount; lenses
  support multiple mounts and image-circle coverage; digital cameras expose
  sensor format and resolution; analog cameras expose camera type and capture
  medium; and fixed-lens cameras expose integrated-lens optics.
- Focal length and maximum aperture are inferred as a best effort from the item
  name with the same parsers as bulk import, and remain editable. Submission
  disables all controls. Errors remain inline without closing the modal;
  success closes it and shows a toast action linking to the created gear page.
- The admin gear table can switch publication state after creation.
- Rumored pages intentionally keep edit tooling available so staff can fill out specs and supporting assets before launch.
- Public-only actions that do not make sense before release should be disabled on rumored pages rather than exposed as if the item were live.

### Adding New Specification Tables

1. Define the schema table under `src/server/db/schema.ts`, giving it a clear PK that references `gear.id` and keeping the column names descriptive.
2. Register relations in `gearRelations` so the new table is reachable from `GearItem` and the registry layers.
3. Extend the spec registry (`src/lib/specs/registry.tsx`) and any UI that consumes the new specs so they render consistently.
4. Update service/data layers plus edit forms or admin flow to read/write the new specs while respecting normalization/validation rules.

### Schema Evolution

- The JSONB `extra` field provides immediate flexibility
- Major changes can be handled through migrations
- Backward compatibility maintained through careful migration planning

## Migration Notes

When deploying this schema:

1. Ensure all required indexes are created
2. Consider data migration if upgrading from a flat structure
3. Update application code to use the new relationship patterns
4. Test performance with realistic data volumes

### Pricing input snapshots

The existing pricing run table includes run kind, optional source and typed JSON
import summaries. Estimate rows optionally store immutable weighted calculation
inputs for future history. No new tables are required. Observation range fields
remain deprecated compatibility columns; new observations are point-only.
See [prices/campricer.md](./prices/campricer.md).
