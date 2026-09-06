# Spec Editing Flow Design

## Overview

The spec editing system provides a clean, intuitive interface for users to suggest changes to gear specifications while maintaining an uncluttered reading experience. The system uses progressive enhancement to deliver the best experience across different devices and user preferences.

## Design Philosophy

### Core Principles

1. **Clean Reading Experience** - Users browsing gear data should not be distracted by editing UI
2. **Progressive Enhancement** - Basic functionality works everywhere, enhanced experience on capable devices
3. **Contextual Editing** - Editing interface appears when users explicitly choose to edit
4. **Unified Data Model** - Single editing interface handles both metadata and specifications
5. **Domain-Specific Validation** - Photography gear specs require specialized input components and validation logic

## UI Architecture

### Desktop Experience (Route Intercepting)

- **Modal Interface**: Clicking "Suggest Edit" opens a modal via Next.js route intercepting
- **Parallel Routing**: Uses `@edit` folder structure for seamless modal experience
- **URL Routing**: Modal maintains proper URL state (`/gear/[slug]/edit`)
- **Context Preservation**: Users stay in context of the gear page
- **Deterministic Dismissal**: Escape and overlay dismissal return to the modal's owning `/gear/[slug]` route without consuming unrelated browser history; browser Back clears the intercepted route and follows the user's existing history

### Mobile Experience (Full Page Navigation)

- **Dedicated Page**: "Suggest Edit" navigates to full edit page
- **Full-Screen Layout**: Optimized for touch interaction and small screens
- **Native Navigation**: Standard browser back button and navigation patterns

## Implementation Strategy

### File Structure

```
app/gear/[slug]/
├── page.tsx                    # Main gear page
├── layout.tsx                  # Handles modal rendering
├── edit/
│   └── page.tsx               # Full edit page
└── @edit/
    └── page.tsx               # Modal intercept
```

### Route Intercepting

- **Desktop**: `@edit` folder intercepts `/edit` route and renders in modal
- **Mobile**: Direct navigation to `/edit` renders full page
- **Fallback**: Modal gracefully degrades to full page if JavaScript is disabled

## Validation Strategy

### Custom Input Components Approach

#### Why Custom Components?

Photography gear specs are incredibly diverse and domain-specific:

- **Aperture**: Specific formatting (f/2.8) with common values
- **Focal Length**: Ranges (24-70mm) or single values (50mm) for prime lenses
- **Resolution**: Complex formats (1920x1080) with presets
- **ISO**: Ranges (100-51200) with standard values
- **Megapixels**: Decimal precision (24.1 MP)

#### Component Examples

```typescript
// Focal Length with Prime/Zoom Toggle
<FocalLengthInput
  value={focalLength}
  onChange={setFocalLength}
  isPrime={isPrimeLens}
  onPrimeToggle={setIsPrimeLens}
/>

// Aperture with Common Values
<ApertureInput
  value={aperture}
  onChange={setAperture}
  commonValues={['f/1.4', 'f/1.8', 'f/2.8', 'f/4']}
/>

// Resolution with Format Presets
<ResolutionInput
  value={resolution}
  onChange={setResolution}
  commonFormats={['4K', '1080p', '720p']}
/>
```

#### Dynamic Form Structure

Components handle complex UI logic internally:

- **State Management**: Prime/zoom toggle, range vs single value
- **Smart Validation**: Business rules (prime lenses must have equal min/max)
- **Value Transformation**: Converting between different data representations
- **User Experience**: Intuitive controls photographers understand

### Zod Integration

#### Perfect Compatibility

Zod works seamlessly with custom components:

```typescript
const FocalLengthSchema = z.object({
  min: z.number().min(8).max(800),
  max: z.number().min(8).max(800),
}).refine(data => data.min <= data.max, {
  message: "Min must be less than or equal to max"
});

// Components use Zod internally for validation
const FocalLengthInput = ({ value, onChange, error }) => {
  const result = FocalLengthSchema.safeParse(value);
  const hasError = !result.success;

  return (
    <div>
      {/* inputs */}
      {hasError && <ErrorMessage>{result.error.message}</ErrorMessage>}
    </div>
  );
};
```

#### Benefits

- **Type Safety**: Full TypeScript support
- **Runtime Validation**: Immediate feedback on data entry
- **Centralized Rules**: Validation logic in one place
- **Component Autonomy**: Each component handles its own validation

### Dynamic Input Rendering

#### Schema-Driven Component Selection

```typescript
const SPEC_FIELD_CONFIG = {
  focalLength: {
    component: 'FocalLengthInput',
    props: { allowRange: true, unit: 'mm' },
    validation: FocalLengthSchema,
    display: 'Focal Length'
  },
  aperture: {
    component: 'ApertureInput',
    props: { allowRange: false, commonValues: ['f/1.4', 'f/2.8'] },
    validation: ApertureSchema,
    display: 'Maximum Aperture'
  }
};

// Dynamic component rendering
const SpecField = ({ fieldName, value, onChange }) => {
  const config = SPEC_FIELD_CONFIG[fieldName];
  if (!config) return <TextInput value={value} onChange={onChange} />;

  const Component = COMPONENT_MAP[config.component];
  return (
    <Component
      value={value}
      onChange={onChange}
      {...config.props}
    />
  );
};
```

#### Component Registry Pattern

```typescript
// src/components/spec-inputs/index.ts
export const SPEC_INPUT_COMPONENTS = {
  FocalLengthInput,
  ApertureInput,
  ResolutionInput,
  ISOInput,
  MegapixelInput,
} as const;

type ComponentName = keyof typeof SPEC_INPUT_COMPONENTS;
```

## User Experience Flow

### 1. Discovery

- **Metadata Section**: "Suggest Edit" button positioned near key information
- **Specs Table**: "Suggest Edit" button above specifications table
- **Visual Design**: Buttons styled as secondary actions, not competing with primary content

### 2. Editing Interface

- **Form Sections**: Logical grouping (Basic Info, Camera Specs, Lens Specs)
- **Current Values**: Pre-filled forms showing existing data
- **Change Preview**: Side-by-side comparison of current vs. proposed values
- **Currency Normalization**: Cent-based price fields are normalized before preview so submitted values render as USD instead of raw cent integers
- **Validation**: Real-time feedback on data entry
- **Smart Defaults**: Common values and presets for photography specs

### 3. Submission

- **Review Changes**: Summary of all proposed modifications
- **Notes**: Optional explanation of why changes are needed
- **Role-Aware Submit**:
  - Editors/Admins: If there are no existing change requests, their submission applies immediately—no review queue, preventing stale merges
  - Trusted contributors: If they have at least one approved spec edit, there are no existing change requests, and the proposal is strictly add-only (fills empty values without overwriting or clearing existing data), the submission applies immediately regardless of gear completeness or publication state. The only registered overwrite exceptions are non-empty replacements of `releaseDatePrecision`, `announceDatePrecision`, and `discontinuedDatePrecision`; clearing any of those precisions, or changing any of the paired date values, still requires review.
  - Everyone else (or staff when another request is open, or trusted contributors whose proposal is not add-only): Submission enters the proposal queue (`status: PENDING`) for review
- **Publication-state awareness**:
  - Rumored and hidden items still keep the internal edit flow available to staff so content can be prepared before publication.
  - Rumored is a manual public-display override and should not fall through to the public under-construction page.
- **Completion Handling**: Confirmation page for queued submissions; auto-applied changes show an immediate success toast and replace the edit route with the canonical gear URL. No transient success query parameter is added, so browser back/forward navigation cannot replay the toast.
- **Decision Persistence**: Each submission stores `metadata.autoApprovalDecision` on the proposal row so admins can see the exact submission-time reason it did or did not auto-approve later on.

## Admin Approval Workflow (Grouped by Gear Item)

The admin approval queue groups pending edit proposals by gear item and lets editors resolve all requests for a gear in one pass.

### Grouped UI

- **One card per gear item**: All pending requests for a given gear are shown together, with a count of pending requests.
- **Author strip**: Each grouped card shows the contributing authors at the top with avatars, names, request counts, and latest submission time.
- **Conflicts section**: For any field where multiple proposals suggest different values, the UI renders a radio group to select exactly one value to apply.
  - Options are labeled with contributor name and submission date.
  - A dedicated "Skip (do not apply this field)" option is available to intentionally exclude a conflicting field.
  - The Approve button remains disabled until every conflicting field has a selection (including an explicit Skip).
- **Additional changes (no conflicts)**: Fields proposed by only one request are listed below conflicts.
  - Each field keeps the contributor attribution visible so moderators can see who supplied the value being merged.
  - Each non-conflicting field has an "Apply this field" checkbox (checked by default). Unchecking excludes the field from application.
- **Footer actions**: `Reject Request` sits beside `Approve Selected` at the bottom of the grouped card.
- **Processing state**: Footer actions reflect loading state while approval or rejection runs.

### What gets applied

On approval, the UI builds a merged, filtered payload composed of only the selected fields:

- Namespaces supported: `core`, `camera`, `analogCamera`, `lens`, `fixedLens`, `cameraCardSlots`, and `videoModes`.
- Measurement changes such as digital and analog `viewfinderEyePointMm` use a friendly field label and unit-formatted values in both contributor previews and moderator review.
- Digital camera native and expanded ISO proposal values use friendly translated contributor labels and consistent `ISO …` formatting in contributor previews and moderator review. Expanded bounds are submitted independently as `isoMinExpanded` and `isoMaxExpanded`. Base ISO is submitted as the whole nullable `baseIso` array; the server validates positive integers, removes duplicates, sorts ascending, and contributor/moderator previews render localized values separated by `/`. The editor is capped at three rows through a shared UI constant, while storage and server normalization remain unrestricted.
- For conflicts, the chosen option (or Skip) determines inclusion.
- For non-conflicts, inclusion depends on the checkbox state (default included).
- `cameraCardSlots` is treated as a replace-set operation; if included, the provided array replaces existing slots for the gear.

### Resolved list

- Resolved items are still listed per request (ungrouped) in a collapsible section.

### Backend behavior and consistency

- Service entry points:
  - Proposals fetch and grouping: `src/server/admin/proposals/service.ts` (`fetchGearProposals`)
  - Approvals: `src/server/admin/proposals/actions.ts` → `approveProposal` service → `approveProposalData`
- On approval, the system:
  - Normalizes the filtered payload to DB types.
  - Applies updates across `core`, `camera`, `lens`, and `cameraCardSlots` (replace set) as provided.
  - Marks all other pending proposals for the same gear as `MERGED` to prevent stale follow-up conflicts.

### Moderator webhook notifications

- New pending change requests trigger moderator Discord webhook notifications via `src/server/admin/proposals/webhook.ts`.
- First request after idle sends immediately and opens a 60-minute aggregation window in Upstash Redis.
- Additional requests during the active window are counted and sampled (up to 5 compact items) for one follow-up summary.
- A serverless cron route (`/api/admin/proposals/webhook/flush`) runs every 5 minutes, flushes only after the window expires, and sends the aggregated summary when pending count is greater than zero.
- Flush uses a short-lived Redis lock to avoid duplicate summary sends under concurrent cron invocations.
- Auto-approved submissions emit a separate immediate webhook event with the approval path and change summary.
- Auto-approved submissions do not contribute to the pending aggregation counters or the pending-request summary window.

### Admin and operator observability

- Pending proposals expose a human-readable auto-approval reason sourced from `gear_edits.metadata.autoApprovalDecision`.
- `GEAR_EDIT_PROPOSE` audit log rows mirror the same decision inside `audit_logs.metadata.autoApprovalDecision`, so the logs page stays historically accurate even if gear data changes later.
- Submissions that do not auto-approve also emit a structured `console.info` line from `submitGearEditProposal` for server-side debugging.
- If a request was eligible but the immediate apply step fails, the persisted reason is updated to `auto_approval_apply_failed` and the proposal remains in the manual review queue.

### Guardrails

- Approve button disabled until all conflicts have an explicit selection.
- Button label is "Approve Selected" to reflect that the payload only includes chosen fields.
- Non-conflicting fields can be individually toggled on/off before approval.

### Notes on display

- Before/after values are rendered consistently with gear pages (e.g., currency formatting, dates, sensor/mount display names).
- For `cameraCardSlots`, the UI shows slot details in a normalized format like `S1: SD UHS-II; S2: CFexpress Type B`.

## Technical Considerations

### State Management

#### Centralized Spec Management

```typescript
const useSpecForm = (initialSpecs) => {
  const [specs, setSpecs] = useState(initialSpecs);
  const [errors, setErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  const updateSpec = useCallback((field, value) => {
    setSpecs((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  return { specs, errors, isDirty, updateSpec };
};
```

#### Form State Complexity

- **Change Tracking**: Clear indication of unsaved modifications
- **Navigation Protection**: Dirty forms trigger a native browser warning on refresh/tab close and a custom discard confirmation for in-app back/link navigation
- **Validation State**: Real-time feedback without blocking submission
- **Performance**: Debounced validation to prevent excessive API calls

### Validation Dependencies

#### Cross-Field Validation

```typescript
const validateCameraSpecs = (specs) => {
  if (specs.sensorFormat === "APS-C" && specs.resolutionMp > 50) {
    return "APS-C sensors don't support resolutions above 50MP";
  }
  // More complex interdependencies between specs
};
```

#### Business Logic Validation

- **Prime vs Zoom Lenses**: Different validation rules for focal length
- **Sensor Format Constraints**: Resolution limits based on sensor type
- **Mount Compatibility**: Lens specs must match mount requirements

### Advanced Features

#### Undo/Redo Functionality

```typescript
const [specHistory, setSpecHistory] = useState([]);
const [currentIndex, setCurrentIndex] = useState(-1);

const undo = () => {
  if (currentIndex > 0) {
    setCurrentIndex(currentIndex - 1);
    setSpecs(specHistory[currentIndex - 1]);
  }
};
```

### Performance Optimization

#### Memoization and Debouncing

```typescript
const SpecForm = memo(({ specs, onChange }) => {
  // Memoize expensive validation
  const validationErrors = useMemo(() =>
    validateAllSpecs(specs), [specs]
  );

  // Debounce onChange to prevent excessive re-renders
  const debouncedOnChange = useCallback(
    debounce(onChange, 300), [onChange]
  );

  return (/* form JSX */);
});
```

#### Lazy Loading

- **Edit Interface**: Loads only when needed
- **Component Libraries**: Import spec input components on demand
- **Validation Rules**: Load validation schemas as required

### Accessibility

#### ARIA and Screen Reader Support

```typescript
const FocalLengthInput = () => {
  return (
    <fieldset aria-labelledby="focal-length-legend">
      <legend id="focal-length-legend">Focal Length</legend>
      <div role="group" aria-describedby="focal-length-help">
        {/* inputs */}
      </div>
      <div id="focal-length-help" className="sr-only">
        Enter focal length in millimeters. For zoom lenses, provide both minimum and maximum values.
      </div>
    </fieldset>
  );
};
```

#### Focus Management

- **Modal Context**: Proper focus handling in modal context
- **Keyboard Navigation**: Full keyboard support for editing interface
- **Screen Reader Support**: Clear navigation and state announcements

## Future Enhancements

### Advanced Features

- **Bulk Editing**: Edit multiple gear items simultaneously
- **Template System**: Pre-defined edit templates for common changes
- **Collaboration**: Multiple users working on the same edit proposal
- **Version History**: Track changes and rollback capabilities
- **AI-Powered Suggestions**: Smart recommendations for common spec values

### Integration Points

- **Admin Workflow**: Seamless integration with existing gear proposal system
- **User Permissions**: Role-based access to different editing capabilities
- **Notification System**: Updates on proposal status and approvals
- **Manufacturer Integration**: Auto-validation against official specifications

## Success Metrics

### User Experience

- **Edit Completion Rate**: Percentage of started edits that are submitted
- **Time to Edit**: Average time from starting edit to submission
- **Error Rate**: Frequency of validation errors and failed submissions
- **User Satisfaction**: Feedback on editing interface usability

### System Performance

- **Modal Load Time**: Time to display editing interface
- **Form Responsiveness**: Input lag and validation feedback speed
- **Mobile Performance**: Edit page load times on mobile devices
- **Validation Performance**: Time to validate complex spec combinations

### Data Quality

- **Validation Success Rate**: Percentage of submissions that pass validation
- **Admin Approval Rate**: Percentage of proposals approved by admins
- **Data Accuracy**: Reduction in spec errors after implementation

## Implementation Timeline

### Phase 1: Core Editing Interface

- Basic edit page with form validation
- Route intercepting for desktop modal experience
- Integration with existing gear proposal system
- Core custom input components (FocalLength, Aperture, Resolution)

### Phase 2: Enhanced User Experience

- Advanced validation and error handling
- Mobile-optimized interface improvements
- Additional spec input components (ISO, Megapixels, etc.)
- Cross-field validation logic

### Phase 3: Advanced Features

- Bulk editing capabilities
- Template system for common changes
- Advanced collaboration features
- Performance optimization and accessibility improvements
