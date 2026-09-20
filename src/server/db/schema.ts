import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date as dateCol,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
// Popularity event enum will be defined below for strong typing in DB

export const appSchema = pgSchema("app");

// Create the pg_trgm extension for similarity functions
export const createExtensions = sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
// export const createTable = pgTableCreator((name) => `sharply_${name}`);

// --- Enums --- now defined inline to ensure migrations create types before use

// Core app enums
export const userRoleEnum = pgEnum("user_role", [
  // Order represents increasing privilege
  "USER",
  "MODERATOR",
  "EDITOR",
  "ADMIN",
  "SUPERADMIN",
]);
export const gearTypeEnum = pgEnum("gear_type", [
  "CAMERA",
  "ANALOG_CAMERA",
  "LENS",
]);
export const gearPublicationStateEnum = pgEnum("gear_publication_state", [
  "PUBLISHED",
  "RUMORED",
  "HIDDEN",
]);
export const gearRegionEnum = pgEnum("gear_region", [
  "GLOBAL",
  "US",
  "EU",
  "JP",
]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "MERGED",
]);
export const auditActionEnum = pgEnum("audit_action", [
  "GEAR_CREATE",
  "GEAR_RENAME",
  "GEAR_DELETE",
  "GEAR_IMAGE_UPLOAD",
  "GEAR_IMAGE_REPLACE",
  "GEAR_IMAGE_REMOVE",
  "GEAR_TOP_VIEW_UPLOAD",
  "GEAR_TOP_VIEW_REPLACE",
  "GEAR_TOP_VIEW_REMOVE",
  "GEAR_REAR_VIEW_UPLOAD",
  "GEAR_REAR_VIEW_REPLACE",
  "GEAR_REAR_VIEW_REMOVE",
  "GEAR_LEFT_VIEW_UPLOAD",
  "GEAR_LEFT_VIEW_REPLACE",
  "GEAR_LEFT_VIEW_REMOVE",
  "GEAR_RIGHT_VIEW_UPLOAD",
  "GEAR_RIGHT_VIEW_REPLACE",
  "GEAR_RIGHT_VIEW_REMOVE",
  "GEAR_COLORWAY_CREATE",
  "GEAR_COLORWAY_UPDATE",
  "GEAR_COLORWAY_REORDER",
  "GEAR_COLORWAY_DELETE",
  "GEAR_COLORWAY_RESET",
  "GEAR_COLORWAY_IMAGE_UPLOAD",
  "GEAR_COLORWAY_IMAGE_REPLACE",
  "GEAR_COLORWAY_IMAGE_REMOVE",
  "GEAR_EDIT_PROPOSE",
  "GEAR_EDIT_APPROVE",
  "GEAR_EDIT_REJECT",
  "GEAR_EDIT_MERGE",
  // Reviews
  "REVIEW_APPROVE",
  "REVIEW_REJECT",
]);
export const reviewStatusEnum = pgEnum("review_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const reviewFlagStatusEnum = pgEnum("review_flag_status", [
  "OPEN",
  "RESOLVED_KEEP",
  "RESOLVED_REJECTED",
  "RESOLVED_DELETED",
]);

// Badges
export const badgeAwardSourceEnum = pgEnum("badge_award_source", [
  "auto",
  "manual",
]);

// Notifications
export const notificationTypeEnum = pgEnum("notification_type", [
  "gear_spec_approved",
  "badge_awarded",
  "prompt_handle_setup",
]);

export const bingoBoardStatusEnum = pgEnum("bingo_board_status", [
  "ACTIVE",
  "COMPLETED",
  "EXPIRED",
  "ARCHIVED",
]);

export const bingoEventTypeEnum = pgEnum("bingo_event_type", [
  "tile_completed",
  "submission_created",
  "score_updated",
  "board_completed",
  "board_expired",
  "board_created",
  "inactivity_timer_started",
  "inactivity_timer_extended",
]);

// Popularity
export const popularityEventTypeEnum = pgEnum("popularity_event_type", [
  "view",
  "wishlist_add",
  "owner_add",
  "compare_add",
  "review_submit",
  "api_fetch",
]);

export const popularityTimeframeEnum = pgEnum("popularity_timeframe", [
  "7d",
  "30d",
]);

// Date precision for partial dates shown to users
export const datePrecisionEnum = pgEnum("date_precision_enum", [
  "YEAR",
  "MONTH",
  "DAY",
]);

// Camera classification
export const cameraTypeEnum = pgEnum("camera_type_enum", [
  "dslr",
  "mirrorless",
  "slr",
  "action",
  "cinema",
]);

/** 1) Card form factor (aka format/shape) */
export const cardFormFactorEnum = pgEnum("card_form_factor_enum", [
  // Modern / current
  "sd",
  "micro_sd",
  "cfexpress_type_a",
  "cfexpress_type_b",
  "cfexpress_type_c",
  "xqd",
  "cfast",

  // Legacy (still seen on spec sheets)
  "compactflash_type_i",
  "compactflash_type_ii",
  "memory_stick_pro_duo",
  "memory_stick_pro_hg_duo",
  "xd_picture_card",
  "smartmedia",
  "sxs", // Sony SxS (ExpressCard form factor; pro video)
  "p2", // Panasonic P2 (PC Card form factor; pro video)
]);

/** 2) Card bus / electrical interface */
export const cardBusEnum = pgEnum("card_bus_enum", [
  // SD family buses
  "sd_default", // legacy (non-UHS)
  "uhs_i",
  "uhs_ii",
  "uhs_iii",
  "sd_express", // PCIe/NVMe over SD

  // CFexpress (PCIe/NVMe lane configs commonly listed)
  "cfexpress_pcie_gen3x1",
  "cfexpress_pcie_gen3x2",
  "cfexpress_pcie_gen4x1",
  "cfexpress_pcie_gen4x2",

  // XQD
  "xqd_1_0",
  "xqd_2_0",

  // CFast (SATA)
  "cfast_sata_ii",
  "cfast_sata_iii",

  // CompactFlash (PATA/UDMA modes)
  "cf_udma4",
  "cf_udma5",
  "cf_udma6",
  "cf_udma7",

  // Pro video buses
  "sxs_pcie_gen1",
  "sxs_pcie_gen2",
  "p2_pci",
]);

/** 3) Speed / performance rating (non-mobile; no A1/A2) */
export const cardSpeedClassEnum = pgEnum("card_speed_class_enum", [
  // SD Speed Class
  "c2",
  "c4",
  "c6",
  "c10",

  // SD UHS Speed Class
  "u1",
  "u3",

  // SD Video Speed Class
  "v6",
  "v10",
  "v30",
  "v60",
  "v90",

  // Video Performance Guarantee (seen on CF/CFast/CFexpress media)
  "vpg_20",
  "vpg_65",
  "vpg_130",
]);

export const viewfinderTypesEnum = pgEnum("viewfinder_types_enum", [
  "none",
  "optical",
  "electronic",
  "hybrid",
  "other",
]);

// Rear display articulation types
export const rearDisplayTypesEnum = pgEnum("rear_display_types_enum", [
  "none", // no rear display
  "fixed", // non-articulating
  "single_axis_tilt", // tilts up/down only
  "dual_axis_tilt", // up/down + side tilt (2-axis)
  "fully_articulated", // side-hinged vari-angle
  "four_axis_tilt_flip", // tilt and flip (sony a9III)
  "other", // other
]);

export const shutterTypesEnum = pgEnum("shutter_types_enum", [
  "mechanical",
  "efc",
  "electronic",
]);

export const exifPrimaryCountTypeEnum = pgEnum("exif_primary_count_type_enum", [
  "total",
  "mechanical",
  "generic",
]);

export const sensorStackingTypesEnum = pgEnum("sensor_stacking_types_enum", [
  "unstacked",
  "partially-stacked",
  "fully-stacked",
]);

export const sensorTechTypesEnum = pgEnum("sensor_tech_types_enum", [
  "cmos",
  "ccd",
]);

export const afSubjectCategoriesEnum = pgEnum(
  "camera_af_subject_categories_enum",
  ["people", "animals", "vehicles", "birds", "aircraft"],
);

export const rawBitDepthEnum = pgEnum("raw_bit_depth_enum", [
  "10",
  "12",
  "14",
  "16",
]);

export const mountMaterialEnum = pgEnum("mount_material_enum", [
  "metal",
  "plastic",
]);

export const lensFilterTypesEnum = pgEnum("lens_filter_types_enum", [
  "none",
  "front-screw-on",
  "rear-screw-on",
  "rear-bayonet",
  "rear-gel-slot",
  "rear-drop-in",
  "internal-rotary",
]);

// lens zoom mechanisms
export const lensZoomTypesEnum = pgEnum("lens_zoom_types_enum", [
  "two-ring", // Separate zoom ring + focus ring; the modern standard for most zoom lenses
  "push-pull", // Single sleeve controls zoom by sliding and often rotates for focal length; common on many analog-era zooms
  "power-zoom", // Motor-driven zoom controlled by rocker or ring; found on some video-oriented and compact systems
  "zoom-by-wire", // Electronic zoom response rather than direct mechanical linkage; typical on some modern mirrorless/video lenses
  "collar-zoom", // Zoom controlled by a rotating collar near the mount; shows up on some specialty designs
  "other",
]);

// --- Recommendations (Enums) ---
export const recommendationRatingEnum = pgEnum("rec_rating", [
  "best value",
  "best performance",
  "situational",
  "balanced",
]);
export const recommendationGroupEnum = pgEnum("rec_group", ["prime", "zoom"]);
export const creatorVideoPlatformEnum = pgEnum("creator_video_platform", [
  "YOUTUBE",
]);

// Analog Camera Types
export const analogTypesEnum = pgEnum("analog_types_enum", [
  "single-lens-reflex-slr",
  "rangefinder",
  "twin-lens-reflex-tlr",
  "point-and-shoot",
  "large-format",
  "instant-film",
  "disposable",
  "toy",
  "stereo",
  "panoramic",
  "folding",
  "box",
  "pinhole",
  "press",
]);

// Analog Film Formats
export const analogMediumEnum = pgEnum("analog_medium_enum", [
  "35mm",
  "half-frame",
  "panoramic-35mm",
  "aps",
  "110",
  "126-instamatic",
  "828",
  "120",
  "220",
  "127",
  "620",
  "large-format-4x5",
  "large-format-5x7",
  "large-format-8x10",
  "ultra-large-format",
  "sheet-film",
  "metal-plate",
  "glass-plate",
  "experimental-other",
]);

// Analog Film Transport Types
export const filmTransportEnum = pgEnum("film_transport_enum", [
  "not-applicable",
  "manual-lever",
  "manual-knob",
  "manual-other",
  "motorized",
  "other",
]);

// Analog Exposure Modes
export const exposureModesEnum = pgEnum("exposure_modes_enum", [
  "manual",
  "aperture-priority",
  "shutter-priority",
  "program",
  "auto",
  "other",
]);

// Note: This enum was incorrectly named. Use meteringModeEnum instead.
// Keeping for backward compatibility but should not be used.
export const exposureModeEnum = pgEnum("metering_mode_enum", [
  "average",
  "center-weighted",
  "spot",
  "other",
]);

// Analog Metering Display Types
export const meteringDisplayTypeEnum = pgEnum("metering_display_type_enum", [
  "needle-middle",
  "needle-match",
  "led-indicators",
  "led-scale",
  "lcd-viewfinder",
  "lcd-top-panel",
  "none",
  "other",
]);

// Analog Focus Aid Types
export const focusAidEnum = pgEnum("focus_aid_enum", [
  // Plain matte screen only
  "none",
  // Split-image prism
  // Looks like: central circle split into two halves that misalign when out of focus
  "split-prism",
  // Microprism
  // Looks like: shimmering or broken image area (dot or ring) when out of focus
  "microprism",
  // Rangefinder patch
  // Looks like: secondary ghosted image that shifts horizontally; when aligned with main image, subject is in focus
  "rangefinder-patch",
  // Electronic focus confirmation
  // Looks like: single dot, light, or symbol that illuminates when focus is achieved
  "electronic-confirm",
  // Directional electronic focus guidance
  // Looks like: arrows pointing left/right or near/far
  "electronic-directional",
  // Autofocus point highlight
  // Looks like: illuminated AF boxes or brackets in the viewfinder
  "af-point",
]);

// Analog Metering Modes
export const meteringModeEnum = pgEnum("metering_mode_enum", [
  "average",
  "center-weighted",
  "spot",
  "other",
]);

// Analog Shutter Types (practical families)
export const shutterTypeEnum = pgEnum("shutter_type_enum", [
  "focal-plane-cloth", // horizontal-travel, Fabric curtains traverse the film gate; classic mechanical SLR feel
  "focal-plane-metal", // vertical-travel, Metal blades traverse the film gate; often supports higher max speeds
  "focal-plane-electronic", // Electronically controlled focal-plane shutter, Focal-plane curtains exist, but exposure timing depends on electronics/battery
  "leaf", // Leaf shutter (in-lens), Iris-style blades inside the lens; typically enables high flash sync speeds
  "rotary", // Rotary/disc shutter, Rotating disc with a cutout exposes film; rare outside specialty cameras
  "none", // No shutter in the body, Exposure controlled externally (rare / specialty setups)
  "other",
]);

// Analog ISO Setting Methods
export const isoSettingMethodEnum = pgEnum("iso_setting_method_enum", [
  "manual", // Manual ISO dial; photographer sets ISO directly for full control and push/pull flexibility
  "dx-only", // DX-coded film only; camera reads ISO from film canister with no manual override
  "dx-with-override", // DX-coded by default with manual ISO override available
  "fixed", // Fixed ISO assumption; camera meters to a single ISO value
  "other",
]);

// Analog Viewfinder Types
export const analogViewfinderTypesEnum = pgEnum(
  "analog_viewfinder_types_enum",
  [
    "none",
    "pentaprism", // Glass prism hump; bright, upright, laterally correct image (typical SLR experience)
    "pentamirror", // Mirror-based prism housing; upright image but dimmer and lighter than pentaprism
    "waist-level", // Flip-up hood viewed from above; reversed image, common on early SLRs and medium format
    "sports-finder", // Open-frame or wire finder; fast framing without precise focus, often auxiliary
    "rangefinder-style", // Separate optical window not through the lens; framing lines, no TTL viewing
    "ground-glass", // Direct ground-glass viewing at film plane; dim but precise, often with loupe
    "other",
  ],
);

// --- Base helpers ---
const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .notNull();

// --- Taxonomy tables ---
export const brands = appSchema.table("brands", () => ({
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  name: varchar("name", { length: 200 }).notNull().unique(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  sortOrder: integer("sort_order"),
  createdAt,
  updatedAt,
}));

export const mounts = appSchema.table("mounts", () => ({
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  value: varchar("value", { length: 200 }).notNull().unique(),
  shortName: varchar("short_name", { length: 10 }),
  brandId: varchar("brand_id", { length: 36 }).references(() => brands.id, {
    onDelete: "restrict",
  }),
  createdAt,
  updatedAt,
}));

export const sensorFormats = appSchema.table("sensor_formats", () => ({
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  name: varchar("name", { length: 200 }).notNull().unique(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  cropFactor: decimal("crop_factor", { precision: 4, scale: 2 }).notNull(),
  widthMm: decimal("width_mm", { precision: 6, scale: 2 }),
  heightMm: decimal("height_mm", { precision: 6, scale: 2 }),
  areaMm2: decimal("area_mm_2", { precision: 8, scale: 2 }),
  description: varchar("description", { length: 500 }),
  createdAt,
  updatedAt,
}));

// --- Genres (Use-cases) ---
export const genres = appSchema.table("genres", () => ({
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  name: varchar("name", { length: 200 }).notNull().unique(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  description: varchar("description", { length: 500 }),
  // Optional scoping for where this genre applies in the catalog UI
  // Values: "camera" and/or "lens"; array may be empty or null to mean "applies broadly"
  appliesTo: text("applies_to").array(),
  createdAt,
  updatedAt,
}));

// --- AF Area Modes Dictionary ---
// Brand-scoped dictionary of AF area modes. Users can add missing items.
// No brandless default fallback. Duplicates allowed; admins merge later.
export const afAreaModes = appSchema.table(
  "af_area_modes",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: varchar("name", { length: 200 }).notNull(),
    // lowercased version of name for LIKE/trigram search
    searchName: text("search_name").notNull(),
    description: varchar("description", { length: 500 }),
    brandId: varchar("brand_id", { length: 36 }).references(() => brands.id, {
      onDelete: "restrict",
    }),
    // Optional synonyms to aid search and de-duplication (array of strings)
    aliases: jsonb("aliases"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("af_area_modes_brand_idx").on(t.brandId),
    index("af_area_modes_name_idx").on(t.name),
    index("af_area_modes_search_name_idx").on(t.searchName),
  ],
);

// Admin merge log of AF area modes: records mapping from duplicate to canonical
// Merge table removed: we will perform in-place mutation/soft-deletes for deduplication.

// --- Gear core ---
export const gear = appSchema.table(
  "gear",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    slug: varchar("slug", { length: 220 }).notNull().unique(),
    searchName: text("search_name").notNull(), // lowercased for LIKE/trigram later
    name: varchar("name", { length: 240 }).notNull().unique(),
    modelNumber: varchar("model_number", { length: 240 }).unique(), // optional model number for de-duplication and display
    gearType: gearTypeEnum("gear_type").notNull(),
    publicationState: gearPublicationStateEnum("publication_state")
      .notNull()
      .default("PUBLISHED"),
    brandId: varchar("brand_id", { length: 36 })
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    /**
     * @deprecated Legacy single-mount pointer.
     * Use the gear_mounts junction table instead (multi-mount via many-to-many).
     * This column remains temporarily for a short buffer period to support
     * rollout and rollback safety. New code MUST NOT read or write this field.
     * Scheduled for removal after deprecation buffer once all reads/writes
     * have been fully migrated.
     */
    mountId: varchar("mount_id", { length: 36 }).references(() => mounts.id, {
      onDelete: "set null",
    }),
    announcedDate: timestamp("announced_date", { withTimezone: true }),
    announceDatePrecision: datePrecisionEnum("announce_date_precision").default(
      "DAY",
    ),
    releaseDate: timestamp("release_date", { withTimezone: true }),
    releaseDatePrecision: datePrecisionEnum("release_date_precision").default(
      "DAY",
    ),
    discontinuedDate: timestamp("discontinued_date", { withTimezone: true }),
    discontinuedDatePrecision: datePrecisionEnum(
      "discontinued_date_precision",
    ).default("DAY"),
    msrpNowUsdCents: integer("msrp_now_usd_cents"),
    msrpAtLaunchUsdCents: integer("msrp_at_launch_usd_cents"),
    // Max observed price on MPB (USD cents), optional
    mpbMaxPriceUsdCents: integer("mpb_max_price_usd_cents"),
    thumbnailUrl: text("thumbnail_url"),
    ogImageUrl: text("og_image_url"),
    topViewUrl: text("top_view_url"),
    rearViewUrl: text("rear_view_url"),
    leftViewUrl: text("left_view_url"),
    rightViewUrl: text("right_view_url"),
    weightGrams: integer("weight_grams"),
    // Physical dimensions
    widthMm: decimal("width_mm", { precision: 6, scale: 2 }),
    heightMm: decimal("height_mm", { precision: 6, scale: 2 }),
    depthMm: decimal("depth_mm", { precision: 6, scale: 2 }),
    // Directional product lineage. These are kept reciprocal by gear services.
    predecessorGearId: varchar("predecessor_gear_id", {
      length: 36,
    }).references((): AnyPgColumn => gear.id, { onDelete: "set null" }),
    successorGearId: varchar("successor_gear_id", { length: 36 }).references(
      (): AnyPgColumn => gear.id,
      { onDelete: "set null" },
    ),
    linkManufacturer: text("link_manufacturer"),
    linkInstructionManual: text("link_instruction_manual"),
    linkMpb: text("link_mpb"),
    linkBh: text("link_bh"),
    linkAmazon: text("link_amazon"),
    // Denormalized shortlist of genre slugs for quick reads (authoritative list via join table)
    genres: jsonb("genres"),
    // Unstructured user notes for the gear item (array of strings)
    notes: text("notes").array(),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("gear_search_idx").on(t.searchName),
    index("gear_publication_state_idx").on(t.publicationState),
    index("gear_type_brand_idx").on(t.gearType, t.brandId),
    index("gear_brand_mount_idx").on(t.brandId, t.mountId),
    index("gear_predecessor_idx").on(t.predecessorGearId),
    index("gear_successor_idx").on(t.successorGearId),
  ],
);

// Editorial discovery tags. Tags deliberately remain separate from structured
// specifications so they can support curation without becoming canonical gear data.
export const tags = appSchema.table(
  "tags",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: varchar("name", { length: 120 }).notNull().unique(),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    description: varchar("description", { length: 500 }),
    icon: varchar("icon", { length: 100 }),
    pageTitle: varchar("page_title", { length: 240 }),
    pageContent: text("page_content"),
    internalNotes: text("internal_notes"),
    unlisted: boolean("unlisted").notNull().default(false),
    createdAt,
    updatedAt,
  }),
  (t) => [index("tags_name_idx").on(t.name)],
);

// One editorial tag may be assigned to a gear item at most once.
export const gearTags = appSchema.table(
  "gear_tags",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    tagId: d
      .varchar("tag_id", { length: 36 })
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.tagId] }),
    index("gear_tags_tag_idx").on(t.tagId),
  ],
);

export const gearColorways = appSchema.table(
  "gear_colorways",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    gearId: varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    swatchColorA: varchar("swatch_color_a", { length: 7 }).notNull(),
    swatchColorB: varchar("swatch_color_b", { length: 7 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    frontImageUrl: text("front_image_url"),
    topViewUrl: text("top_view_url"),
    rearViewUrl: text("rear_view_url"),
    leftViewUrl: text("left_view_url"),
    rightViewUrl: text("right_view_url"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    uniqueIndex("gear_colorways_gear_slug_uidx").on(t.gearId, t.slug),
    index("gear_colorways_gear_order_idx").on(t.gearId, t.sortOrder),
  ],
);

// Regional aliases for gear names (one per gear + region)
export const gearAliases = appSchema.table(
  "gear_aliases",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    region: gearRegionEnum("region").notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    createdAt,
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.region] }),
    index("gear_aliases_gear_idx").on(t.gearId),
    index("gear_aliases_region_idx").on(t.region),
  ],
);

// Many-to-many: Gear x Genres
export const gearGenres = appSchema.table(
  "gear_genres",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    genreId: d
      .varchar("genre_id", { length: 36 })
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
    createdAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.genreId] }),
    index("gear_genres_gear_idx").on(t.gearId),
    index("gear_genres_genre_idx").on(t.genreId),
  ],
);

// Many-to-many: Gear x Mounts (new table for multi-mount support, e.g., Sigma lenses)
// Note: gear.mountId is kept for backward compatibility and will contain the "primary" mount
export const gearMounts = appSchema.table(
  "gear_mounts",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    mountId: d
      .varchar("mount_id", { length: 36 })
      .notNull()
      .references(() => mounts.id, { onDelete: "restrict" }),
    createdAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.mountId] }),
    index("gear_mounts_gear_idx").on(t.gearId),
    index("gear_mounts_mount_idx").on(t.mountId),
  ],
);

// Raw sample artifacts that can be attached to gear via a junction table.
export const rawSamples = appSchema.table(
  "raw_samples",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    fileUrl: text("file_url").notNull(),
    originalFilename: varchar("original_filename", { length: 255 }),
    contentType: varchar("content_type", { length: 120 }),
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: varchar("uploaded_by_user_id", { length: 255 }),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("raw_samples_file_url_idx").on(t.fileUrl),
    index("raw_samples_user_idx").on(t.uploadedByUserId),
  ],
);

// Junction table linking gear items to raw samples.
export const gearRawSamples = appSchema.table(
  "gear_raw_samples",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    rawSampleId: d
      .varchar("raw_sample_id", { length: 36 })
      .notNull()
      .references(() => rawSamples.id, { onDelete: "cascade" }),
    createdAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.rawSampleId] }),
    index("gear_raw_samples_gear_idx").on(t.gearId),
    index("gear_raw_samples_sample_idx").on(t.rawSampleId),
  ],
);

// --- Gear Specification Tables ---
export const cameraSpecs = appSchema.table(
  "camera_specs",
  () => ({
    gearId: varchar("gear_id", { length: 36 })
      .primaryKey()
      .references(() => gear.id, { onDelete: "cascade" }),
    // sensor
    sensorFormatId: varchar("sensor_format_id", { length: 36 }).references(
      () => sensorFormats.id,
      { onDelete: "set null" },
    ),
    resolutionMp: decimal("resolution_mp", { precision: 6, scale: 2 }),
    sensorStackingType: sensorStackingTypesEnum("sensor_stacking_type"),
    sensorTechType: sensorTechTypesEnum("sensor_tech_type"),
    isBackSideIlluminated: boolean("is_back_side_illuminated"),
    isoMin: integer("iso_min"),
    isoMax: integer("iso_max"),
    isoMinExpanded: integer("iso_min_expanded"),
    isoMaxExpanded: integer("iso_max_expanded"),
    baseIso: integer("base_iso").array(),
    sensorReadoutSpeedMs: decimal("sensor_readout_speed_ms", {
      precision: 4,
      scale: 1,
    }), // we will provide a checkbox for global shutter which sets this to 0ms
    maxRawBitDepth: rawBitDepthEnum("max_raw_bit_depth"),
    hasIbis: boolean("has_ibis"),
    hasElectronicVibrationReduction: boolean(
      "has_electronic_vibration_reduction",
    ),
    cipaStabilizationRatingStops: decimal("cipa_stabilization_rating_stops", {
      precision: 4,
      scale: 1,
    }),
    hasPixelShiftShooting: boolean("has_pixel_shift_shooting"),
    hasAntiAliasingFilter: boolean("has_anti_aliasing_filter"),
    precaptureSupportLevel: integer("precapture_support_level"),
    // hardware
    cameraType: cameraTypeEnum("camera_type"),
    processorName: varchar("processor_name", { length: 200 }),
    hasWeatherSealing: boolean("has_weather_sealing"),
    // focus
    hasAutofocus: boolean("has_autofocus"),
    focusPoints: integer("focus_points"),
    afSubjectCategories: afSubjectCategoriesEnum(
      "af_subject_categories",
    ).array(),
    hasFocusPeaking: boolean("has_focus_peaking"),
    hasFocusBracketing: boolean("has_focus_bracketing"),
    // shutter
    shutterSpeedMax: integer("shutter_speed_max"),
    shutterSpeedMin: integer("shutter_speed_min"),
    maxFpsRaw: decimal("max_fps_raw", { precision: 4, scale: 1 }),
    maxFpsJpg: decimal("max_fps_jpg", { precision: 4, scale: 1 }),
    maxFpsByShutter: jsonb("max_fps_by_shutter"),
    flashSyncSpeed: integer("flash_sync_speed"),
    hasSilentShootingAvailable: boolean("has_silent_shooting_available"),
    availableShutterTypes: shutterTypesEnum("available_shutter_types").array(),
    // battery
    internalStorageGb: decimal("internal_storage_gb", {
      precision: 6,
      scale: 1,
    }),
    cipaBatteryShotsPerCharge: integer("cipa_battery_shots_per_charge"),
    supportedBatteries: text("supported_batteries").array(),
    usbPowerDelivery: boolean("usb_power_delivery"),
    usbCharging: boolean("usb_charging"),
    // video
    hasVideo: boolean("has_video"),
    hasLogColorProfile: boolean("has_log_color_profile"),
    has10BitVideo: boolean("has_10_bit_video"),
    has12BitVideo: boolean("has_12_bit_video"),
    hasOpenGateVideo: boolean("has_open_gate_video"),
    supportsExternalRecording: boolean("supports_external_recording"),
    supportsRecordToDrive: boolean("supports_record_to_drive"),
    // misc
    hasIntervalometer: boolean("has_intervalometer"),
    hasSelfTimer: boolean("has_self_timer"),
    hasBuiltInFlash: boolean("has_built_in_flash"),
    hasHotShoe: boolean("has_hot_shoe"),
    hasIlluminatedButtons: boolean("has_illuminated_buttons"),
    hasUsbFileTransfer: boolean("has_usb_file_transfer"),
    // displays & viewfinder
    rearDisplayType: rearDisplayTypesEnum("rear_display_type"),
    rearDisplayResolutionMillionDots: decimal(
      "rear_display_resolution_million_dots",
      { precision: 6, scale: 2 },
    ),
    rearDisplaySizeInches: decimal("rear_display_size_inches", {
      precision: 4,
      scale: 2,
    }),
    hasRearTouchscreen: boolean("has_rear_touchscreen"),
    viewfinderType: viewfinderTypesEnum("viewfinder_type"),
    viewfinderMagnification: decimal("viewfinder_magnification", {
      precision: 4,
      scale: 2,
    }),
    viewfinderEyePointMm: decimal("viewfinder_eye_point_mm", {
      precision: 5,
      scale: 2,
    }),
    viewfinderResolutionMillionDots: decimal(
      "viewfinder_resolution_million_dots",
      { precision: 6, scale: 2 },
    ),
    hasTopDisplay: boolean("has_top_display"),
    extra: jsonb("extra"),
    createdAt,
    updatedAt,
  }),
  // 1:1 already enforced by PK=gearId; index format if you like
  (t) => [index("camera_specs_sensor_idx").on(t.sensorFormatId)],
);

export const cameraVideoModes = appSchema.table(
  "camera_video_modes",
  () => ({
    id: uuid("id").defaultRandom().primaryKey(),
    gearId: varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    resolutionKey: varchar("resolution_key", { length: 64 }).notNull(),
    resolutionLabel: varchar("resolution_label", { length: 120 }).notNull(),
    resolutionHorizontal: integer("resolution_horizontal"),
    resolutionVertical: integer("resolution_vertical"),
    fps: integer("fps").notNull(),
    codecLabel: varchar("codec_label", { length: 120 }).notNull(),
    bitDepth: integer("bit_depth").notNull(),
    cropFactor: boolean("crop_factor").notNull().default(false),
    notes: text("notes"),
    createdAt,
    updatedAt,
  }),
  (t) => [index("camera_video_modes_gear_idx").on(t.gearId)],
);

// --- Camera AF Area Specs ---
// Which AF area modes are assigned to which camera (gear_type = CAMERA)
export const cameraAfAreaSpecs = appSchema.table(
  "camera_af_area_specs",
  () => ({
    gearId: varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    afAreaModeId: varchar("af_area_mode_id", { length: 36 })
      .notNull()
      .references(() => afAreaModes.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.afAreaModeId] }),
    index("camera_af_area_specs_af_area_mode_idx").on(t.afAreaModeId),
    index("camera_af_area_specs_gear_idx").on(t.gearId),
  ],
);

export const cameraCardSlots = appSchema.table(
  "camera_card_slots",
  () => ({
    id: uuid("id").defaultRandom().primaryKey(),
    // Replace `cameras` with your actual cameras table
    gearId: uuid("gear_id").notNull(),
    slotIndex: integer("slot_index").notNull(), // 1,2,...
    supportedFormFactors: cardFormFactorEnum("supported_form_factors")
      .array()
      .notNull(),
    supportedBuses: cardBusEnum("supported_buses").array().notNull(),
    supportedSpeedClasses: cardSpeedClassEnum(
      "supported_speed_classes",
    ).array(), // optional
    notes: text("notes"),
    createdAt,
    updatedAt,
  }),
  (t) => [uniqueIndex("uniq_camera_card_slot").on(t.gearId, t.slotIndex)],
);

// Analog Camera Specs
export const analogCameraSpecs = appSchema.table(
  "analog_camera_specs",
  () => ({
    gearId: varchar("gear_id", { length: 36 })
      .primaryKey()
      .references(() => gear.id, { onDelete: "cascade" }),
    cameraType: analogTypesEnum("camera_type"), // list of analog camera types
    // film/capture medium
    captureMedium: analogMediumEnum("capture_medium"), //list of film types, or other capture medium
    filmTransportType: filmTransportEnum("film_transport_type"), // list of film transport types
    hasAutoFilmAdvance: boolean("has_auto_film_advance"), //weather the film advanced automatically after each shot
    hasOptionalMotorizedDrive: boolean("has_optional_motorized_drive"), //weather the camera has an optional motorized drive for the film advance
    // viewfinder
    viewfinderType: analogViewfinderTypesEnum("viewfinder_type"),
    viewfinderEyePointMm: decimal("viewfinder_eye_point_mm", {
      precision: 5,
      scale: 2,
    }),
    // exposure & shutter
    shutterType: shutterTypeEnum("shutter_type"),
    shutterSpeedMax: integer("shutter_speed_max"), // in seconds
    shutterSpeedMin: integer("shutter_speed_min"), // in fractions of a second (1/1000)
    flashSyncSpeed: integer("flash_sync_speed"), // in fractions of a second (1/250)
    hasBulbMode: boolean("has_bulb_mode"),
    hasMetering: boolean("has_metering"),
    meteringModes: meteringModeEnum("metering_modes").array(),
    exposureModes: exposureModesEnum("exposure_modes").array(),
    meteringDisplayTypes: meteringDisplayTypeEnum(
      "metering_display_types",
    ).array(),
    hasExposureCompensation: boolean("has_exposure_compensation"),
    isoSettingMethod: isoSettingMethodEnum("iso_setting_method"),
    isoMin: integer("iso_min"),
    isoMax: integer("iso_max"),
    // focus
    hasAutoFocus: boolean("has_auto_focus"),
    focusAidTypes: focusAidEnum("focus_aid_types").array(),
    // electronics
    requiresBatteryForShutter: boolean("requires_battery_for_shutter"),
    requiresBatteryForMetering: boolean("requires_battery_for_metering"),
    supportedBatteries: text("supported_batteries").array(),
    hasContinuousDrive: boolean("has_continuous_drive"),
    maxContinuousFps: decimal("max_continuous_fps", {
      precision: 4,
      scale: 1,
    }),
    hasHotShoe: boolean("has_hot_shoe"),
    hasSelfTimer: boolean("has_self_timer"),
    hasIntervalometer: boolean("has_intervalometer"),
    // meta
    createdAt,
    updatedAt,
  }),
  (t) => [index("analog_camera_specs_gear_idx").on(t.gearId)],
);

// Lenses
export const lensSpecs = appSchema.table(
  "lens_specs",
  () => ({
    gearId: varchar("gear_id", { length: 36 })
      .primaryKey()
      .references(() => gear.id, { onDelete: "cascade" }),
    // focal length
    isPrime: boolean("is_prime"),
    focalLengthMinMm: decimal("focal_length_min_mm", {
      precision: 5,
      scale: 1,
      mode: "number",
    }),
    focalLengthMaxMm: decimal("focal_length_max_mm", {
      precision: 5,
      scale: 1,
      mode: "number",
    }),
    imageCircleSizeId: varchar("image_circle_size_id", {
      length: 36,
    }).references(() => sensorFormats.id, { onDelete: "set null" }),
    // aperture
    maxApertureWide: decimal("max_aperture_wide", { precision: 4, scale: 2 }),
    maxApertureTele: decimal("max_aperture_tele", { precision: 4, scale: 2 }), // nullable
    minApertureWide: decimal("min_aperture_wide", { precision: 4, scale: 2 }),
    minApertureTele: decimal("min_aperture_tele", { precision: 4, scale: 2 }), // nullable
    apertureProfileJson: jsonb("aperture_profile_json").$type<
      { focalLength: number; aperture: number }[]
    >(),
    // stabilization
    hasStabilization: boolean("has_stabilization"),
    cipaStabilizationRatingStops: decimal("cipa_stabilization_rating_stops", {
      precision: 4,
      scale: 1,
    }),
    hasStabilizationSwitch: boolean("has_stabilization_switch"),
    // focus
    hasAutofocus: boolean("has_autofocus"),
    isMacro: boolean("is_macro"),
    magnification: decimal("magnification", { precision: 4, scale: 2 }),
    minimumFocusDistanceMm: integer("minimum_focus_distance_mm"), // TODO: display this using mapping as feet/meters
    hasFocusRing: boolean("has_focus_ring"),
    focusMotorType: text("focus_motor_type"), //TODO: may want to make a relation for this eventually, brands have proprietary names for different types
    focusThrowDegrees: integer("focus_throw_degrees"),
    hasAfMfSwitch: boolean("has_af_mf_switch"),
    hasFocusLimiter: boolean("has_focus_limiter"),
    hasFocusRecallButton: boolean("has_focus_recall_button"),
    // optics
    numberElements: integer("number_elements"),
    numberElementGroups: integer("number_element_groups"),
    hasDiffractiveOptics: boolean("has_diffractive_optics"), // also known as phase fresnel elements
    // build or features
    lensZoomType: lensZoomTypesEnum("lens_zoom_type"),
    numberDiaphragmBlades: integer("number_diaphragm_blades"),
    hasRoundedDiaphragmBlades: boolean("has_rounded_diaphragm_blades"),
    hasInternalZoom: boolean("has_internal_zoom"),
    hasInternalFocus: boolean("has_internal_focus"),
    frontElementRotates: boolean("front_element_rotates"),
    mountMaterial: mountMaterialEnum("mount_material"),
    hasWeatherSealing: boolean("has_weather_sealing"),
    hasApertureRing: boolean("has_aperture_ring"),
    numberCustomControlRings: integer("number_custom_control_rings"),
    numberFunctionButtons: integer("number_function_buttons"),
    acceptsFilterTypes: lensFilterTypesEnum("accepts_filter_types").array(),
    frontFilterThreadSizeMm: integer("front_filter_thread_size_mm"),
    rearFilterThreadSizeMm: integer("rear_filter_thread_size_mm"),
    dropInFilterSizeMm: integer("drop_in_filter_size_mm"),
    hasBuiltInTeleconverter: boolean("has_built_in_teleconverter"),
    hasLensHood: boolean("has_lens_hood"),
    hasTripodCollar: boolean("has_tripod_collar"),
    // tilt-shift
    isTiltShift: boolean("is_tilt_shift"),
    tiltDegrees: decimal("tilt_degrees", { precision: 4, scale: 1 }),
    shiftMm: decimal("shift_mm", { precision: 5, scale: 1 }),
    extra: jsonb("extra"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("lens_specs_focal_idx").on(t.focalLengthMinMm, t.focalLengthMaxMm),
  ],
);

// Fixed-lens specs (for cameras with integrated lenses)
export const fixedLensSpecs = appSchema.table(
  "fixed_lens_specs",
  () => ({
    gearId: varchar("gear_id", { length: 36 })
      .primaryKey()
      .references(() => gear.id, { onDelete: "cascade" }),
    // focal length
    isPrime: boolean("is_prime"),
    focalLengthMinMm: decimal("focal_length_min_mm", {
      precision: 5,
      scale: 1,
      mode: "number",
    }),
    focalLengthMaxMm: decimal("focal_length_max_mm", {
      precision: 5,
      scale: 1,
      mode: "number",
    }),
    imageCircleSizeId: varchar("image_circle_size_id", {
      length: 36,
    }).references(() => sensorFormats.id, { onDelete: "set null" }),
    // aperture
    maxApertureWide: decimal("max_aperture_wide", { precision: 4, scale: 2 }),
    maxApertureTele: decimal("max_aperture_tele", { precision: 4, scale: 2 }),
    minApertureWide: decimal("min_aperture_wide", { precision: 4, scale: 2 }),
    minApertureTele: decimal("min_aperture_tele", { precision: 4, scale: 2 }),
    // focus & build (simplified)
    hasAutofocus: boolean("has_autofocus"),
    minimumFocusDistanceMm: integer("minimum_focus_distance_mm"),
    frontElementRotates: boolean("front_element_rotates"),
    frontFilterThreadSizeMm: integer("front_filter_thread_size_mm"),
    hasLensHood: boolean("has_lens_hood"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("fixed_lens_specs_focal_idx").on(
      t.focalLengthMinMm,
      t.focalLengthMaxMm,
    ),
  ],
);

// --- Gear Edits ---
export const gearEdits = appSchema.table(
  "gear_edits",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    gearId: varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    createdById: varchar("created_by_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: proposalStatusEnum("status").notNull().default("PENDING"),
    // payload: proposed diffs for core + subtype; keep it compact
    payload: jsonb("payload").notNull(), // { core?: {...}, camera?: {...}, lens?: {...} }
    metadata: jsonb("metadata"),
    note: text("note"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("gear_edits_status_idx").on(t.status),
    index("gear_edits_gear_idx").on(t.gearId),
    index("gear_edits_created_by_idx").on(t.createdById),
  ],
);

// --- Audit Logs ---
export const auditLogs = appSchema.table(
  "audit_logs",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    action: auditActionEnum("action").notNull(),
    actorUserId: varchar("actor_user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    gearId: varchar("gear_id", { length: 36 }).references(() => gear.id, {
      onDelete: "set null",
    }),
    gearEditId: varchar("gear_edit_id", { length: 36 }).references(
      () => gearEdits.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata"),
    createdAt,
  }),
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_action_idx").on(t.action),
    index("audit_actor_idx").on(t.actorUserId),
    index("audit_gear_idx").on(t.gearId),
    index("audit_edit_idx").on(t.gearEditId),
  ],
);

// --- Personal Reviews ---
export const reviews = appSchema.table(
  "reviews",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    gearId: varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    createdById: varchar("created_by_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: reviewStatusEnum("status").notNull().default("PENDING"),
    // Review metadata
    genres: jsonb("genres"),
    recommend: boolean("recommend"),
    content: text("content").notNull(),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("reviews_status_idx").on(t.status),
    index("reviews_gear_idx").on(t.gearId),
    index("reviews_created_by_idx").on(t.createdById),
    index("reviews_created_by_created_at_idx").on(t.createdById, t.createdAt),
  ],
);

export const reviewFlags = appSchema.table(
  "review_flags",
  () => ({
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    reviewId: varchar("review_id", { length: 36 })
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    reporterUserId: varchar("reporter_user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: reviewFlagStatusEnum("status").notNull().default("OPEN"),
    resolvedByUserId: varchar("resolved_by_user_id", {
      length: 255,
    }).references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("review_flags_status_idx").on(t.status),
    index("review_flags_review_status_idx").on(t.reviewId, t.status),
    index("review_flags_reporter_status_idx").on(t.reporterUserId, t.status),
  ],
);

// --- AI Review Summaries (one row per gear) ---
export const reviewSummaries = appSchema.table(
  "review_summaries",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .primaryKey()
      .references(() => gear.id, { onDelete: "cascade" }),
    summaryText: d.text("summary_text"),
    updatedAt,
  }),
  (t) => [index("review_summaries_updated_idx").on(t.updatedAt)],
);

// --- Editorial: Use-case Ratings ---
export const useCaseRatings = appSchema.table(
  "use_case_ratings",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    genreId: d
      .varchar("genre_id", { length: 36 })
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
    score: d.integer("score").notNull(), // 0-10
    note: d.text("note"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.genreId] }),
    index("ucr_gear_idx").on(t.gearId),
    index("ucr_genre_idx").on(t.genreId),
  ],
);

// --- Editorial: Staff Verdicts ---
export const staffVerdicts = appSchema.table(
  "staff_verdicts",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .primaryKey()
      .references(() => gear.id, { onDelete: "cascade" }),
    content: d.text("content"), // optional
    pros: d.jsonb("pros"), // string[]
    cons: d.jsonb("cons"), // string[]
    whoFor: d.text("who_for"),
    notFor: d.text("not_for"),
    alternatives: d.jsonb("alternatives"), // string[]
    authorUserId: d
      .varchar("author_user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  }),
  (t) => [index("staff_verdicts_author_idx").on(t.authorUserId)],
);

export const approvedCreators = appSchema.table(
  "approved_creators",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: d.varchar("name", { length: 200 }).notNull(),
    platform: creatorVideoPlatformEnum("platform").notNull(),
    channelUrl: d.text("channel_url").notNull(),
    avatarUrl: d.text("avatar_url"),
    isActive: d.boolean("is_active").notNull().default(true),
    internalNotes: d.text("internal_notes"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("approved_creators_name_idx").on(t.name),
    index("approved_creators_platform_active_idx").on(t.platform, t.isActive),
  ],
);

export const gearCreatorVideos = appSchema.table(
  "gear_creator_videos",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    creatorId: d
      .varchar("creator_id", { length: 36 })
      .notNull()
      .references(() => approvedCreators.id, { onDelete: "restrict" }),
    sourceUrl: d.text("source_url").notNull(),
    normalizedUrl: d.text("normalized_url").notNull(),
    embedUrl: d.text("embed_url").notNull(),
    platform: creatorVideoPlatformEnum("platform").notNull(),
    externalVideoId: d.varchar("external_video_id", { length: 64 }).notNull(),
    title: d.text("title").notNull(),
    thumbnailUrl: d.text("thumbnail_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    editorNote: d.text("editor_note"),
    isActive: d.boolean("is_active").notNull().default(true),
    createdByUserId: d
      .varchar("created_by_user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: d
      .varchar("updated_by_user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("gear_creator_videos_gear_active_idx").on(t.gearId, t.isActive),
    index("gear_creator_videos_creator_idx").on(t.creatorId),
    index("gear_creator_videos_platform_external_idx").on(
      t.platform,
      t.externalVideoId,
    ),
    uniqueIndex("gear_creator_videos_gear_platform_external_uidx").on(
      t.gearId,
      t.platform,
      t.externalVideoId,
    ),
  ],
);

// --- Gear Relations ---
export const gearRelations = relations(gear, ({ one, many }) => ({
  cameraSpecs: one(cameraSpecs, {
    fields: [gear.id],
    references: [cameraSpecs.gearId],
  }),
  analogCameraSpecs: one(analogCameraSpecs, {
    fields: [gear.id],
    references: [analogCameraSpecs.gearId],
  }),
  lensSpecs: one(lensSpecs, {
    fields: [gear.id],
    references: [lensSpecs.gearId],
  }),
  fixedLensSpecs: one(fixedLensSpecs, {
    fields: [gear.id],
    references: [fixedLensSpecs.gearId],
  }),
  edits: many(gearEdits),
  reviews: many(reviews),
  genres: many(gearGenres),
  mounts: many(gearMounts),
  useCaseRatings: many(useCaseRatings),
  staffVerdict: one(staffVerdicts, {
    fields: [gear.id],
    references: [staffVerdicts.gearId],
  }),
  creatorVideos: many(gearCreatorVideos),
  rawSamples: many(gearRawSamples),
  aliases: many(gearAliases),
  colorways: many(gearColorways),
}));

export const gearColorwaysRelations = relations(gearColorways, ({ one }) => ({
  gear: one(gear, {
    fields: [gearColorways.gearId],
    references: [gear.id],
  }),
}));

export const gearAliasesRelations = relations(gearAliases, ({ one }) => ({
  gear: one(gear, {
    fields: [gearAliases.gearId],
    references: [gear.id],
  }),
}));

export const gearMountsRelations = relations(gearMounts, ({ one }) => ({
  gear: one(gear, {
    fields: [gearMounts.gearId],
    references: [gear.id],
  }),
  mount: one(mounts, {
    fields: [gearMounts.mountId],
    references: [mounts.id],
  }),
}));

export const gearRawSamplesRelations = relations(gearRawSamples, ({ one }) => ({
  gear: one(gear, {
    fields: [gearRawSamples.gearId],
    references: [gear.id],
  }),
  rawSample: one(rawSamples, {
    fields: [gearRawSamples.rawSampleId],
    references: [rawSamples.id],
  }),
}));

export const rawSamplesRelations = relations(rawSamples, ({ many }) => ({
  gearAssociations: many(gearRawSamples),
}));

export const gearEditsRelations = relations(gearEdits, ({ one }) => ({
  gear: one(gear, {
    fields: [gearEdits.gearId],
    references: [gear.id],
  }),
  createdBy: one(users, {
    fields: [gearEdits.createdById],
    references: [users.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  gear: one(gear, {
    fields: [reviews.gearId],
    references: [gear.id],
  }),
  createdBy: one(users, {
    fields: [reviews.createdById],
    references: [users.id],
  }),
  flags: many(reviewFlags),
}));

export const reviewFlagsRelations = relations(reviewFlags, ({ one }) => ({
  review: one(reviews, {
    fields: [reviewFlags.reviewId],
    references: [reviews.id],
  }),
  reporter: one(users, {
    fields: [reviewFlags.reporterUserId],
    references: [users.id],
  }),
  resolvedBy: one(users, {
    fields: [reviewFlags.resolvedByUserId],
    references: [users.id],
  }),
}));

// --- Editorial Relations ---
export const useCaseRatingsRelations = relations(useCaseRatings, ({ one }) => ({
  gear: one(gear, { fields: [useCaseRatings.gearId], references: [gear.id] }),
  genre: one(genres, {
    fields: [useCaseRatings.genreId],
    references: [genres.id],
  }),
}));

export const staffVerdictsRelations = relations(staffVerdicts, ({ one }) => ({
  gear: one(gear, { fields: [staffVerdicts.gearId], references: [gear.id] }),
  author: one(users, {
    fields: [staffVerdicts.authorUserId],
    references: [users.id],
  }),
}));

export const approvedCreatorsRelations = relations(
  approvedCreators,
  ({ many }) => ({
    gearVideos: many(gearCreatorVideos),
  }),
);

export const gearCreatorVideosRelations = relations(
  gearCreatorVideos,
  ({ one }) => ({
    gear: one(gear, {
      fields: [gearCreatorVideos.gearId],
      references: [gear.id],
    }),
    creator: one(approvedCreators, {
      fields: [gearCreatorVideos.creatorId],
      references: [approvedCreators.id],
    }),
    createdBy: one(users, {
      relationName: "gear_creator_video_created_by",
      fields: [gearCreatorVideos.createdByUserId],
      references: [users.id],
    }),
    updatedBy: one(users, {
      relationName: "gear_creator_video_updated_by",
      fields: [gearCreatorVideos.updatedByUserId],
      references: [users.id],
    }),
  }),
);

// Relations declared AFTER table declarations below

// --- Recommendations ---
export const recommendationCharts = appSchema.table(
  "recommendation_charts",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    brand: d.varchar("brand", { length: 120 }).notNull(),
    slug: d.varchar("slug", { length: 200 }).notNull(),
    title: d.varchar("title", { length: 300 }).notNull(),
    description: d.varchar("description", { length: 800 }),
    updatedDate: dateCol("updated_date").notNull(),
    isPublished: d.boolean("is_published").notNull().default(true),
    createdAt,
    updatedAt,
  }),
  (t) => [uniqueIndex("rec_brand_slug").on(t.brand, t.slug)],
);

export const recommendationItems = appSchema.table(
  "recommendation_items",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    chartId: d
      .varchar("chart_id", { length: 36 })
      .notNull()
      .references(() => recommendationCharts.id, { onDelete: "cascade" }),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "restrict" }),
    rating: recommendationRatingEnum("rating").notNull(),
    note: d.text("note"),
    // Optional overrides controlling grouping
    groupOverride: recommendationGroupEnum("group_override"),
    customColumn: d.varchar("custom_column", { length: 120 }),
    // Per-item price range override (display only)
    priceMinOverride: d.integer("price_min_override"),
    priceMaxOverride: d.integer("price_max_override"),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("rec_items_chart_idx").on(t.chartId),
    index("rec_items_gear_idx").on(t.gearId),
  ],
);

// --- Recommendation Relations ---
export const recommendationChartsRelations = relations(
  recommendationCharts,
  ({ many }) => ({
    items: many(recommendationItems),
  }),
);

export const recommendationItemsRelations = relations(
  recommendationItems,
  ({ one }) => ({
    chart: one(recommendationCharts, {
      fields: [recommendationItems.chartId],
      references: [recommendationCharts.id],
    }),
    gear: one(gear, {
      fields: [recommendationItems.gearId],
      references: [gear.id],
    }),
  }),
);

export const gearGenresRelations = relations(gearGenres, ({ one }) => ({
  gear: one(gear, { fields: [gearGenres.gearId], references: [gear.id] }),
  genre: one(genres, { fields: [gearGenres.genreId], references: [genres.id] }),
}));

export const genresRelations = relations(genres, ({ many }) => ({
  gearLinks: many(gearGenres),
}));

// --- Interactions ---
export const userLists = appSchema.table(
  "user_lists",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: d.varchar("name", { length: 140 }).notNull(),
    isDefault: d.boolean("is_default").notNull().default(false),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("user_lists_user_idx").on(t.userId),
    index("user_lists_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const userListItems = appSchema.table(
  "user_list_items",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    listId: d
      .varchar("list_id", { length: 36 })
      .notNull()
      .references(() => userLists.id, { onDelete: "cascade" }),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt,
    updatedAt,
  }),
  (t) => [
    uniqueIndex("user_list_items_list_gear_uq").on(t.listId, t.gearId),
    index("user_list_items_list_position_idx").on(t.listId, t.position),
    index("user_list_items_gear_idx").on(t.gearId),
  ],
);

export const sharedLists = appSchema.table(
  "shared_lists",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    listId: d
      .varchar("list_id", { length: 36 })
      .notNull()
      .references(() => userLists.id, { onDelete: "cascade" }),
    slug: d.varchar("slug", { length: 180 }).notNull(),
    publicId: d.varchar("public_id", { length: 20 }).notNull(),
    isPublished: d.boolean("is_published").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    unpublishedAt: timestamp("unpublished_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    uniqueIndex("shared_lists_list_uq").on(t.listId),
    uniqueIndex("shared_lists_public_id_uq").on(t.publicId),
    index("shared_lists_slug_idx").on(t.slug),
  ],
);

export const userListsRelations = relations(userLists, ({ one, many }) => ({
  user: one(users, {
    fields: [userLists.userId],
    references: [users.id],
  }),
  items: many(userListItems),
  shared: many(sharedLists),
}));

export const userListItemsRelations = relations(userListItems, ({ one }) => ({
  list: one(userLists, {
    fields: [userListItems.listId],
    references: [userLists.id],
  }),
  gear: one(gear, {
    fields: [userListItems.gearId],
    references: [gear.id],
  }),
}));

export const sharedListsRelations = relations(sharedLists, ({ one }) => ({
  list: one(userLists, {
    fields: [sharedLists.listId],
    references: [userLists.id],
  }),
}));

export const wishlists = appSchema.table(
  "wishlists",
  (d) => ({
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    createdAt,
  }),
  (t) => [
    primaryKey({ columns: [t.userId, t.gearId] }),
    index("wishlist_gear_idx").on(t.gearId),
  ],
);

export const ownerships = appSchema.table(
  "ownerships",
  (d) => ({
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    colorwayId: d
      .varchar("colorway_id", { length: 36 })
      .references(() => gearColorways.id, { onDelete: "set null" }),
    createdAt,
  }),
  (t) => [
    primaryKey({ columns: [t.userId, t.gearId] }),
    index("ownership_gear_idx").on(t.gearId),
    index("ownership_colorway_idx").on(t.colorwayId),
  ],
);

export const imageRequests = appSchema.table(
  "image_requests",
  (d) => ({
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    createdAt,
  }),
  (t) => [
    primaryKey({ columns: [t.userId, t.gearId] }),
    index("image_request_gear_idx").on(t.gearId),
  ],
);

export const gearExifAliases = appSchema.table(
  "gear_exif_aliases",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    normalizedBrand: d.varchar("normalized_brand", { length: 32 }),
    makeRaw: d.varchar("make_raw", { length: 255 }),
    modelRaw: d.varchar("model_raw", { length: 255 }).notNull(),
    makeNormalized: d.text("make_normalized"),
    modelNormalized: d.text("model_normalized").notNull(),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("gear_exif_aliases_gear_idx").on(t.gearId),
    index("gear_exif_aliases_make_model_idx").on(
      t.makeNormalized,
      t.modelNormalized,
    ),
    uniqueIndex("gear_exif_aliases_gear_make_model_uq").on(
      t.gearId,
      t.makeNormalized,
      t.modelNormalized,
    ),
  ],
);

export const gearExifAliasesRelations = relations(
  gearExifAliases,
  ({ one }) => ({
    gear: one(gear, {
      fields: [gearExifAliases.gearId],
      references: [gear.id],
    }),
  }),
);

export const exifTrackedCameras = appSchema.table(
  "exif_tracked_cameras",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .references(() => gear.id, { onDelete: "set null" }),
    normalizedBrand: d.varchar("normalized_brand", { length: 32 }),
    makeRaw: d.varchar("make_raw", { length: 255 }),
    modelRaw: d.varchar("model_raw", { length: 255 }),
    serialHash: d.text("serial_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    uniqueIndex("exif_tracked_cameras_user_serial_uq").on(
      t.userId,
      t.serialHash,
    ),
    index("exif_tracked_cameras_gear_idx").on(t.gearId),
    index("exif_tracked_cameras_user_idx").on(t.userId),
  ],
);

export const exifShutterReadings = appSchema.table(
  "exif_shutter_readings",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    trackedCameraId: d
      .varchar("tracked_camera_id", { length: 36 })
      .notNull()
      .references(() => exifTrackedCameras.id, { onDelete: "cascade" }),
    dedupeKey: d.text("dedupe_key").notNull(),
    captureAt: timestamp("capture_at", { withTimezone: true }),
    primaryCountType: exifPrimaryCountTypeEnum("primary_count_type").notNull(),
    primaryCountValue: integer("primary_count_value").notNull(),
    shutterCount: integer("shutter_count"),
    totalShutterCount: integer("total_shutter_count"),
    mechanicalShutterCount: integer("mechanical_shutter_count"),
    sourceTag: d.varchar("source_tag", { length: 255 }),
    mechanicalSourceTag: d.varchar("mechanical_source_tag", { length: 255 }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    uniqueIndex("exif_shutter_readings_dedupe_uq").on(t.dedupeKey),
    index("exif_shutter_readings_tracked_camera_idx").on(t.trackedCameraId),
    index("exif_shutter_readings_camera_capture_idx").on(
      t.trackedCameraId,
      t.captureAt,
    ),
  ],
);

export const exifTrackedCamerasRelations = relations(
  exifTrackedCameras,
  ({ one, many }) => ({
    user: one(users, {
      fields: [exifTrackedCameras.userId],
      references: [users.id],
    }),
    gear: one(gear, {
      fields: [exifTrackedCameras.gearId],
      references: [gear.id],
    }),
    readings: many(exifShutterReadings),
  }),
);

export const exifShutterReadingsRelations = relations(
  exifShutterReadings,
  ({ one }) => ({
    trackedCamera: one(exifTrackedCameras, {
      fields: [exifShutterReadings.trackedCameraId],
      references: [exifTrackedCameras.id],
    }),
  }),
);

// Popularity events table
export const popularityEvents = appSchema.table(
  "popularity_events",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    userId: d
      .varchar("user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    visitorId: d.varchar("visitor_id", { length: 64 }),
    eventType: popularityEventTypeEnum("event_type").notNull(),
    createdAt,
  }),
  (t) => [
    index("pop_events_gear_idx").on(t.gearId),
    index("pop_events_gear_type_idx").on(t.gearId, t.eventType),
    index("pop_events_created_idx").on(t.createdAt),
    index("pop_events_visitor_idx").on(t.visitorId),
    index("pop_events_gear_visitor_created_idx").on(
      t.gearId,
      t.visitorId,
      t.createdAt,
    ),
  ],
);

// Live intraday counters (UTC date scoped, reset nightly by rollup)
export const gearPopularityIntraday = appSchema.table(
  "gear_popularity_intraday",
  (d) => ({
    date: dateCol("date").notNull(),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    views: integer("views").notNull().default(0),
    wishlistAdds: integer("wishlist_adds").notNull().default(0),
    ownerAdds: integer("owner_adds").notNull().default(0),
    compareAdds: integer("compare_adds").notNull().default(0),
    reviewSubmits: integer("review_submits").notNull().default(0),
    apiFetches: integer("api_fetches").notNull().default(0),
    createdAt,
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.date, t.gearId] }),
    index("gpi_gear_idx").on(t.gearId),
    index("gpi_date_idx").on(t.date),
  ],
);

// --- Popularity Rollup Tables ---
export const gearPopularityDaily = appSchema.table(
  "gear_popularity_daily",
  (d) => ({
    date: dateCol("date").notNull(),
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    views: integer("views").notNull().default(0),
    wishlistAdds: integer("wishlist_adds").notNull().default(0),
    ownerAdds: integer("owner_adds").notNull().default(0),
    compareAdds: integer("compare_adds").notNull().default(0),
    reviewSubmits: integer("review_submits").notNull().default(0),
    apiFetches: integer("api_fetches").notNull().default(0),
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.date, t.gearId] }),
    index("gpd_gear_idx").on(t.gearId),
    index("gpd_date_idx").on(t.date),
  ],
);

// popularityTimeframeEnum imported

export const gearPopularityWindows = appSchema.table(
  "gear_popularity_windows",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    timeframe: popularityTimeframeEnum("timeframe").notNull(),
    asOfDate: dateCol("as_of_date").notNull(),
    viewsSum: integer("views_sum").notNull().default(0),
    wishlistAddsSum: integer("wishlist_adds_sum").notNull().default(0),
    ownerAddsSum: integer("owner_adds_sum").notNull().default(0),
    compareAddsSum: integer("compare_adds_sum").notNull().default(0),
    reviewSubmitsSum: integer("review_submits_sum").notNull().default(0),
    apiFetchesSum: integer("api_fetches_sum").notNull().default(0),
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearId, t.timeframe] }),
    index("gpw_timeframe_idx").on(t.timeframe),
  ],
);

export const gearPopularityLifetime = appSchema.table(
  "gear_popularity_lifetime",
  (d) => ({
    gearId: d
      .varchar("gear_id", { length: 36 })
      .primaryKey()
      .references(() => gear.id, { onDelete: "cascade" }),
    viewsLifetime: integer("views_lifetime").notNull().default(0),
    wishlistLifetimeAdds: integer("wishlist_lifetime_adds")
      .notNull()
      .default(0),
    ownerLifetimeAdds: integer("owner_lifetime_adds").notNull().default(0),
    compareLifetimeAdds: integer("compare_lifetime_adds").notNull().default(0),
    reviewLifetimeSubmits: integer("review_lifetime_submits")
      .notNull()
      .default(0),
    apiFetchLifetime: integer("api_fetch_lifetime").notNull().default(0),
    updatedAt,
  }),
  (t) => [index("gpl_gear_idx").on(t.gearId)],
);

// --- Compare Pair Counters (minimal) ---
export const comparePairCounts = appSchema.table(
  "compare_pair_counts",
  (d) => ({
    // Denormalized convenience key derived from sorted slugs (e.g., "slugA|slugB").
    // Not used for uniqueness; updated with current slugs on increment.
    pairKey: d.varchar("pair_key", { length: 500 }).notNull(),
    // Canonical pair ordering by gear ids; used for uniqueness and upsert target
    gearAId: d
      .varchar("gear_a_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    gearBId: d
      .varchar("gear_b_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    count: d.integer("count").notNull().default(0),
    updatedAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearAId, t.gearBId] }),
    index("pair_counts_gear_a_idx").on(t.gearAId),
    index("pair_counts_gear_b_idx").on(t.gearBId),
    index("pair_counts_count_idx").on(t.count),
  ],
);

// --- Gear Alternatives (symmetric pairs with competitor flag) ---
export const gearAlternatives = appSchema.table(
  "gear_alternatives",
  (d) => ({
    // Canonical pair ordering: gearAId < gearBId (lexicographically)
    gearAId: d
      .varchar("gear_a_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    gearBId: d
      .varchar("gear_b_id", { length: 36 })
      .notNull()
      .references(() => gear.id, { onDelete: "cascade" }),
    isCompetitor: d.boolean("is_competitor").notNull().default(false),
    createdAt,
  }),
  (t) => [
    primaryKey({ columns: [t.gearAId, t.gearBId] }),
    index("gear_alternatives_gear_a_idx").on(t.gearAId),
    index("gear_alternatives_gear_b_idx").on(t.gearBId),
  ],
);

// Rollup run history
export const rollupRuns = appSchema.table(
  "rollup_runs",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    asOfDate: dateCol("as_of_date").notNull(),
    correctedDate: dateCol("corrected_date").notNull(),
    dailyRows: integer("daily_rows").notNull().default(0),
    lateArrivals: integer("late_arrivals").notNull().default(0),
    windowsRows: integer("windows_rows").notNull().default(0),
    lifetimeTotalRows: integer("lifetime_total_rows").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    success: boolean("success").notNull().default(false),
    error: text("error"),
    createdAt,
  }),
  (t) => [index("rollup_runs_created_idx").on(t.createdAt)],
);

// DEFAULT //

// export const posts = appSchema.table(
//   "post",
//   (d) => ({
//     id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
//     name: d.varchar({ length: 256 }),
//     createdById: d
//       .varchar({ length: 255 })
//       .notNull()
//       .references(() => users.id),
//     createdAt: d
//       .timestamp({ withTimezone: true })
//       .default(sql`CURRENT_TIMESTAMP`)
//       .notNull(),
//     updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
//   }),
//   (t) => [
//     index("created_by_idx").on(t.createdById),
//     index("name_idx").on(t.name),
//   ],
// );

export const notifications = appSchema.table(
  "notifications",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    sourceType: varchar("source_type", { length: 100 }),
    sourceId: varchar("source_id", { length: 100 }),
    metadata: jsonb("metadata"),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
    index("notifications_user_archived_idx").on(t.userId, t.archivedAt),
  ],
);

export const bingoBoards = appSchema.table(
  "bingo_boards",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    status: bingoBoardStatusEnum("status").notNull().default("ACTIVE"),
    inactivityDurationSeconds: integer("inactivity_duration_seconds")
      .notNull()
      .default(4 * 60 * 60),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    firstCompletedAt: timestamp("first_completed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    endReason: varchar("end_reason", { length: 30 }),
    createdByUserId: d
      .varchar("created_by_user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("bingo_boards_status_idx").on(t.status),
    index("bingo_boards_created_idx").on(t.createdAt),
  ],
);

export const bingoSubmissions = appSchema.table(
  "bingo_submissions",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    boardId: d
      .varchar("board_id", { length: 36 })
      .notNull()
      .references(() => bingoBoards.id, { onDelete: "cascade" }),
    boardTileId: d
      .varchar("board_tile_id", { length: 36 })
      .notNull()
      .references((): AnyPgColumn => bingoBoardTiles.id, {
        onDelete: "cascade",
      }),
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    discordMessageUrl: text("discord_message_url").notNull(),
    discordGuildId: varchar("discord_guild_id", { length: 50 }),
    discordChannelId: varchar("discord_channel_id", { length: 50 }),
    discordMessageId: varchar("discord_message_id", { length: 50 }),
    validationPassed: boolean("validation_passed").notNull().default(true),
    validationMetadata: jsonb("validation_metadata"),
    createdAt,
  }),
  (t) => [
    index("bingo_submissions_board_idx").on(t.boardId),
    index("bingo_submissions_user_idx").on(t.userId),
    index("bingo_submissions_tile_idx").on(t.boardTileId),
    index("bingo_submissions_created_idx").on(t.createdAt),
  ],
);

export const bingoBoardTiles = appSchema.table(
  "bingo_board_tiles",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    boardId: d
      .varchar("board_id", { length: 36 })
      .notNull()
      .references(() => bingoBoards.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    isFreeTile: boolean("is_free_tile").notNull().default(false),
    completedByUserId: d
      .varchar("completed_by_user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    completedSubmissionId: d
      .varchar("completed_submission_id", { length: 36 })
      .references((): AnyPgColumn => bingoSubmissions.id, {
        onDelete: "set null",
      }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    uniqueIndex("bingo_board_tiles_board_position_uq").on(
      t.boardId,
      t.position,
    ),
    index("bingo_board_tiles_board_completed_idx").on(t.boardId, t.completedAt),
  ],
);

export const bingoScores = appSchema.table(
  "bingo_scores",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    boardId: d
      .varchar("board_id", { length: 36 })
      .notNull()
      .references(() => bingoBoards.id, { onDelete: "cascade" }),
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    points: integer("points").notNull().default(0),
    createdAt,
    updatedAt,
  }),
  (t) => [
    uniqueIndex("bingo_scores_board_user_uq").on(t.boardId, t.userId),
    index("bingo_scores_board_points_idx").on(t.boardId, t.points),
  ],
);

export const bingoEvents = appSchema.table(
  "bingo_events",
  (d) => ({
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    type: bingoEventTypeEnum("type").notNull(),
    boardId: d
      .varchar("board_id", { length: 36 })
      .notNull()
      .references(() => bingoBoards.id, { onDelete: "cascade" }),
    boardTileId: d
      .varchar("board_tile_id", { length: 36 })
      .references(() => bingoBoardTiles.id, { onDelete: "set null" }),
    submissionId: d
      .varchar("submission_id", { length: 36 })
      .references(() => bingoSubmissions.id, { onDelete: "set null" }),
    userId: d
      .varchar("user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload"),
    createdAt,
  }),
  (t) => [
    index("bingo_events_board_idx").on(t.boardId),
    index("bingo_events_board_id_idx").on(t.boardId, t.id),
    index("bingo_events_created_idx").on(t.createdAt),
  ],
);

export const passkeys = appSchema.table(
  "passkeys",
  (d) => ({
    id: d
      .varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    name: d.varchar("name", { length: 255 }).notNull(),
    publicKey: d.text("public_key").notNull(),
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: d.text("credential_id").notNull(),
    counter: d.integer("counter").notNull().default(0),
    deviceType: d.varchar("device_type", { length: 100 }),
    backedUp: d.boolean("backed_up").notNull().default(false),
    transports: d.text("transports"),
    aaguid: d.varchar("aaguid", { length: 255 }),
    createdAt,
  }),
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const bingoBoardsRelations = relations(bingoBoards, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [bingoBoards.createdByUserId],
    references: [users.id],
  }),
  tiles: many(bingoBoardTiles),
  submissions: many(bingoSubmissions),
  scores: many(bingoScores),
  events: many(bingoEvents),
}));

export const bingoBoardTilesRelations = relations(
  bingoBoardTiles,
  ({ one, many }) => ({
    board: one(bingoBoards, {
      fields: [bingoBoardTiles.boardId],
      references: [bingoBoards.id],
    }),
    completedBy: one(users, {
      fields: [bingoBoardTiles.completedByUserId],
      references: [users.id],
    }),
    submission: one(bingoSubmissions, {
      fields: [bingoBoardTiles.completedSubmissionId],
      references: [bingoSubmissions.id],
    }),
    events: many(bingoEvents),
  }),
);

export const bingoSubmissionsRelations = relations(
  bingoSubmissions,
  ({ one, many }) => ({
    board: one(bingoBoards, {
      fields: [bingoSubmissions.boardId],
      references: [bingoBoards.id],
    }),
    user: one(users, {
      fields: [bingoSubmissions.userId],
      references: [users.id],
    }),
    events: many(bingoEvents),
  }),
);

export const bingoScoresRelations = relations(bingoScores, ({ one }) => ({
  board: one(bingoBoards, {
    fields: [bingoScores.boardId],
    references: [bingoBoards.id],
  }),
  user: one(users, {
    fields: [bingoScores.userId],
    references: [users.id],
  }),
}));

export const bingoEventsRelations = relations(bingoEvents, ({ one }) => ({
  board: one(bingoBoards, {
    fields: [bingoEvents.boardId],
    references: [bingoBoards.id],
  }),
  tile: one(bingoBoardTiles, {
    fields: [bingoEvents.boardTileId],
    references: [bingoBoardTiles.id],
  }),
  submission: one(bingoSubmissions, {
    fields: [bingoEvents.submissionId],
    references: [bingoSubmissions.id],
  }),
  user: one(users, {
    fields: [bingoEvents.userId],
    references: [users.id],
  }),
}));

// --- Badges Storage (minimal) ---
export const userBadges = appSchema.table(
  "user_badges",
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeKey: d.varchar({ length: 200 }).notNull(),
    awardedAt: d
      .timestamp({ mode: "date", withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    source: badgeAwardSourceEnum("source").notNull().default("auto"),
    context: jsonb("context"),
    sortOverride: integer("sort_override"),
  }),
  (t) => [primaryKey({ columns: [t.userId, t.badgeKey] })],
);

// Optional: append-only award log for audit/analytics
export const badgeAwardsLog = appSchema.table(
  "badge_awards_log",
  (d) => ({
    id: d
      .varchar({ length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: d
      .varchar({ length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    badgeKey: d.varchar({ length: 200 }).notNull(),
    eventType: d.varchar({ length: 100 }).notNull(),
    source: badgeAwardSourceEnum("source").notNull().default("auto"),
    context: jsonb("context"),
    awardedAt: d
      .timestamp({ mode: "date", withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("badge_awards_log_user_idx").on(t.userId),
    index("badge_awards_log_awarded_idx").on(t.awardedAt),
    index("badge_awards_log_badge_idx").on(t.badgeKey),
  ],
);

// --- Invites ---
export const invites = appSchema.table(
  "invites",
  (d) => ({
    id: d
      .varchar({ length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    inviteeName: d.varchar({ length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("USER"),
    createdById: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    isUsed: d.boolean("is_used").notNull().default(false),
    usedByUserId: d
      .varchar({ length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    usedAt: d.timestamp({ mode: "date", withTimezone: true }),
    createdAt,
    updatedAt,
  }),
  (t) => [
    index("invites_created_by_idx").on(t.createdById),
    index("invites_is_used_idx").on(t.isUsed),
    index("invites_used_by_idx").on(t.usedByUserId),
  ],
);

// -- AUTH SCHEMA --

export const users = appSchema.table("user", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.varchar({ length: 255 }),
  handle: d.varchar({ length: 50 }).unique(),
  email: d.varchar({ length: 255 }).notNull(),
  // changed from timestamp to boolean
  emailVerified: d.boolean().notNull().default(false),
  image: d.varchar({ length: 255 }),
  discordImage: d.varchar("discord_image", { length: 500 }),
  avatarSource: d.varchar("avatar_source", {
    length: 16,
    enum: ["discord", "custom"],
  }),
  role: userRoleEnum("role").notNull().default("USER"),
  // Sequential public member number, first user is 1, second is 2, etc.
  memberNumber: integer("member_number")
    .generatedByDefaultAsIdentity()
    .notNull()
    .unique(),
  // Invite used to join (if applicable). Stored for audit, no FK to avoid cycle.
  inviteId: varchar("invite_id", { length: 36 }),
  // Social links (array of {label: string, url: string, icon?: string})
  socialLinks: jsonb("social_links"),
  preferredBrandId: varchar("preferred_brand_id", { length: 36 }).references(
    () => brands.id,
    {
      onDelete: "set null",
    },
  ),
  preferredMountId: varchar("preferred_mount_id", { length: 36 }).references(
    () => mounts.id,
    {
      onDelete: "set null",
    },
  ),
  // Developer API access is explicitly granted by an administrator.
  developerAccessEnabled: d
    .boolean("developer_access_enabled")
    .notNull()
    .default(false),
  createdAt,
  updatedAt: d
    .timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}));

export const usersRelations = relations(users, ({ many }) => ({
  gearEdits: many(gearEdits),
  reviews: many(reviews),
  notifications: many(notifications),
  passkeys: many(passkeys),
  userLists: many(userLists),
  trackedExifCameras: many(exifTrackedCameras),
  bingoBoardsCreated: many(bingoBoards),
  bingoTilesCompleted: many(bingoBoardTiles),
  bingoSubmissions: many(bingoSubmissions),
  bingoScores: many(bingoScores),
  bingoEvents: many(bingoEvents),
}));

// Export the user type for use throughout the application
export type User = typeof users.$inferSelect;

// -- DEVELOPER API --

/**
 * User-owned credentials for the public developer API. The plaintext secret
 * is never persisted: only a SHA-256 digest and non-sensitive display prefix
 * are stored.
 */
export const developerApiKeys = appSchema.table(
  "developer_api_keys",
  (d) => ({
    id: d
      .varchar({ length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: d
      .varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: d.varchar({ length: 100 }).notNull(),
    keyPrefix: d.varchar("key_prefix", { length: 48 }).notNull(),
    keyHash: d.varchar("key_hash", { length: 64 }).notNull().unique(),
    lastUsedAt: d.timestamp("last_used_at", { withTimezone: true }),
    revokedAt: d.timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: d
      .varchar("revoked_by_user_id", { length: 255 })
      .references(() => users.id, { onDelete: "set null" }),
    createdAt,
  }),
  (t) => [
    index("developer_api_keys_user_active_idx").on(t.userId, t.revokedAt),
    index("developer_api_keys_last_used_idx").on(t.lastUsedAt),
  ],
);

/** Fixed UTC-minute counters used to atomically enforce per-key rate limits. */
export const developerApiRateLimitBuckets = appSchema.table(
  "developer_api_rate_limit_buckets",
  (d) => ({
    apiKeyId: d
      .varchar("api_key_id", { length: 36 })
      .notNull()
      .references(() => developerApiKeys.id, { onDelete: "cascade" }),
    windowStart: d.timestamp("window_start", { withTimezone: true }).notNull(),
    requestCount: d.integer("request_count").notNull().default(0),
  }),
  (t) => [
    primaryKey({ columns: [t.apiKeyId, t.windowStart] }),
    index("developer_api_rate_limit_buckets_window_idx").on(t.windowStart),
  ],
);

/** Daily request aggregates for the portal, admin view, and later billing. */
export const developerApiUsageDaily = appSchema.table(
  "developer_api_usage_daily",
  (d) => ({
    apiKeyId: d
      .varchar("api_key_id", { length: 36 })
      .notNull()
      .references(() => developerApiKeys.id, { onDelete: "cascade" }),
    usageDate: d.date("usage_date", { mode: "date" }).notNull(),
    totalRequests: d.integer("total_requests").notNull().default(0),
    searchRequests: d.integer("search_requests").notNull().default(0),
    suggestionRequests: d.integer("suggestion_requests").notNull().default(0),
    gearRequests: d.integer("gear_requests").notNull().default(0),
  }),
  (t) => [
    primaryKey({ columns: [t.apiKeyId, t.usageDate] }),
    index("developer_api_usage_daily_date_idx").on(t.usageDate),
  ],
);

export const authSessions = appSchema.table(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_sessions_userId_idx").on(table.userId)],
);

export const authAccounts = appSchema.table(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("auth_accounts_userId_idx").on(table.userId)],
);

export const authVerifications = appSchema.table(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

export const authJwks = appSchema.table("auth_jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at"),
});

export const oauthClients = appSchema.table("oauth_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  disabled: boolean("disabled").default(false),
  skipConsent: boolean("skip_consent"),
  enableEndSession: boolean("enable_end_session"),
  scopes: text("scopes").array(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").array().notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  grantTypes: text("grant_types").array(),
  responseTypes: text("response_types").array(),
  public: boolean("public"),
  type: text("type"),
  referenceId: text("reference_id"),
  metadata: jsonb("metadata"),
});

export const oauthRefreshTokens = appSchema.table("oauth_refresh_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => authSessions.id, {
    onDelete: "set null",
  }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at"),
  revoked: timestamp("revoked"),
  scopes: text("scopes").array().notNull(),
});

export const oauthAccessTokens = appSchema.table("oauth_access_tokens", {
  id: text("id").primaryKey(),
  token: text("token").unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => authSessions.id, {
    onDelete: "set null",
  }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  refreshId: text("refresh_id").references(() => oauthRefreshTokens.id, {
    onDelete: "cascade",
  }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at"),
  scopes: text("scopes").array().notNull(),
});

export const oauthConsents = appSchema.table("oauth_consents", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const authUsersRelations = relations(users, ({ many }) => ({
  sessions: many(authSessions),
  accounts: many(authAccounts),
  oauthClients: many(oauthClients),
  oauthRefreshTokens: many(oauthRefreshTokens),
  oauthAccessTokens: many(oauthAccessTokens),
  oauthConsents: many(oauthConsents),
}));

export const authSessionsRelations = relations(
  authSessions,
  ({ one, many }) => ({
    users: one(users, {
      fields: [authSessions.userId],
      references: [users.id],
    }),
    oauthRefreshTokens: many(oauthRefreshTokens),
    oauthAccessTokens: many(oauthAccessTokens),
  }),
);

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  users: one(users, {
    fields: [authAccounts.userId],
    references: [users.id],
  }),
}));

export const passkeysRelations = relations(passkeys, ({ one }) => ({
  user: one(users, { fields: [passkeys.userId], references: [users.id] }),
}));

export const oauthClientsRelations = relations(
  oauthClients,
  ({ one, many }) => ({
    user: one(users, {
      fields: [oauthClients.userId],
      references: [users.id],
    }),
    refreshTokens: many(oauthRefreshTokens),
    accessTokens: many(oauthAccessTokens),
    consents: many(oauthConsents),
  }),
);

export const oauthRefreshTokensRelations = relations(
  oauthRefreshTokens,
  ({ one, many }) => ({
    client: one(oauthClients, {
      fields: [oauthRefreshTokens.clientId],
      references: [oauthClients.clientId],
    }),
    session: one(authSessions, {
      fields: [oauthRefreshTokens.sessionId],
      references: [authSessions.id],
    }),
    user: one(users, {
      fields: [oauthRefreshTokens.userId],
      references: [users.id],
    }),
    accessTokens: many(oauthAccessTokens),
  }),
);

export const oauthAccessTokensRelations = relations(
  oauthAccessTokens,
  ({ one }) => ({
    client: one(oauthClients, {
      fields: [oauthAccessTokens.clientId],
      references: [oauthClients.clientId],
    }),
    session: one(authSessions, {
      fields: [oauthAccessTokens.sessionId],
      references: [authSessions.id],
    }),
    user: one(users, {
      fields: [oauthAccessTokens.userId],
      references: [users.id],
    }),
    refreshToken: one(oauthRefreshTokens, {
      fields: [oauthAccessTokens.refreshId],
      references: [oauthRefreshTokens.id],
    }),
  }),
);

export const oauthConsentsRelations = relations(oauthConsents, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthConsents.clientId],
    references: [oauthClients.clientId],
  }),
  user: one(users, {
    fields: [oauthConsents.userId],
    references: [users.id],
  }),
}));
