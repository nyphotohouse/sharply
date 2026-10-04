# Constants Generation

The constants generator snapshots light-weight reference data (brands, mounts, sensor formats, genres, AF area modes, enums) into `src/lib/generated.ts`. The app then imports those arrays directly instead of hitting the database for values that rarely change.

## How It Works

1. `scripts/generate-constants.ts` connects to the database specified by `DATABASE_URL`.
2. The script **only runs** when `GENERATE_CONSTANTS=true` exists in the environment. Otherwise it logs `Skipping constants generation...` and returns without touching the DB or filesystem.
3. On success it writes `src/lib/generated.ts`, exporting `MOUNTS`, `SENSOR_FORMATS`, `BRANDS`, `GENRES`, `AF_AREA_MODES`, and an `ENUMS` map plus the helper type `EnumValues`.
4. `BRANDS` mirrors the full `app.brands` snapshot, including nullable ordering metadata such as `sort_order` when present. Brand selectors use that metadata to show prioritized brands first, followed by the remaining brands alphabetically.
5. `package.json` wires `npm run prebuild` to execute `npm run constants:generate`, so CI (Vercel, etc.) can regenerate before a build simply by setting `GENERATE_CONSTANTS=true`.

Admins can add brands from the brand sorting tool on `/admin/tools`. This writes the brand to `app.brands` immediately; selectors backed by generated `BRANDS` arrays pick it up after the constants generator runs during a build with `GENERATE_CONSTANTS=true`. Review and commit the regenerated `src/lib/generated.ts` snapshot when maintaining the canonical catalog.

## Usage

### 1. Configure Environment

> ⚠️ **Contributors generally do not need to run this script.** `src/lib/generated.ts` is checked into the repo and kept up to date by maintainers with access to the canonical database. Running the generator without live DB access will produce empty/default data and wipe your copy of the constants file. If you are new to the project, leave `GENERATE_CONSTANTS=false` (the default) and treat `generated.ts` as a read-only artifact.

For maintainers who need to regenerate:

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/sharply-dev
export GENERATE_CONSTANTS=true
npm run constants:generate
```

This creates/updates `src/lib/generated.ts`. Always review and commit the file so contributors inherit the latest snapshot.

### 3. Import

```ts
import { MOUNTS, SENSOR_FORMATS, BRANDS, ENUMS } from "~/lib/generated";

const rfMount = MOUNTS.find((m) => m.value === "rf-canon");
type MountValue = (typeof MOUNTS)[number]["value"];
```

## When to Regenerate

- After any migration or manual change that touches the source tables/enums.
- After changing brand sort order values if the new order should be reflected in generated brand lists and select menus.
- After adding a brand through the admin tool if it should be reflected in generated brand lists and select menus.
- Before deployments to ensure `generated.ts` reflects the canonical data.
- Whenever CI (or the `protect-generated` workflow) reports that `src/lib/generated.ts` is out of sync.

## Benefits

- **Type safety** – compile-time validation of IDs and enum values.
- **Performance** – no runtime database queries for reference data.
- **Consistency** – a single generated file shared by client and server code.
- **Developer experience** – IntelliSense/autocomplete when accessing constants.

## Safety Tips

- Keep `GENERATE_CONSTANTS=false` in `.env` unless you are a maintainer regenerating intentionally.
- Use a read-only or dev credential when running the script locally.
- Treat `src/lib/generated.ts` as source-controlled output—review diffs just like any other code change.

## Future Enhancements

- Automatically verify during CI that `generated.ts` matches the database schema.
- Expand coverage to additional reference tables (gear categories, badges, etc.).
- Provide a checksum so the build can assert whether regeneration is required.
