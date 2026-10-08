export interface StaffVerdictNavigationData {
  content?: string | null;
  pros?: unknown;
  cons?: unknown;
  whoFor?: string | null;
  notFor?: string | null;
  alternatives?: unknown;
}

export interface GearSectionNavItem {
  href: string;
  label: string;
}

interface BuildGearSectionNavItemsInput {
  hasEditorialReview: boolean;
  hasInstructionManual: boolean;
  hasCreatorVideos: boolean;
  hasRawSamples: boolean;
  hasAlternatives: boolean;
  hasRelatedArticles: boolean;
  verdict: StaffVerdictNavigationData | null;
  labels?: {
    staffVerdict: string;
    specs: string;
    instructionManual: string;
    review: string;
    reviews: string;
    rawSamples: string;
    alternatives: string;
    creatorVideos: string;
    articles: string;
  };
}

function hasNonEmptyString(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasNonEmptyStringArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === "string" && hasNonEmptyString(item))
  );
}

export function hasStaffVerdictContent(
  verdict: StaffVerdictNavigationData | null,
) {
  if (!verdict) {
    return false;
  }

  return (
    hasNonEmptyString(verdict.content) ||
    hasNonEmptyStringArray(verdict.pros) ||
    hasNonEmptyStringArray(verdict.cons) ||
    hasNonEmptyString(verdict.whoFor) ||
    hasNonEmptyString(verdict.notFor) ||
    hasNonEmptyStringArray(verdict.alternatives)
  );
}

export function buildGearSectionNavItems({
  hasEditorialReview,
  hasInstructionManual,
  hasCreatorVideos,
  hasRawSamples,
  hasAlternatives,
  hasRelatedArticles,
  verdict,
  labels,
}: BuildGearSectionNavItemsInput): GearSectionNavItem[] {
  const resolvedLabels = {
    staffVerdict: labels?.staffVerdict ?? "Staff Verdict",
    specs: labels?.specs ?? "Specs",
    instructionManual: labels?.instructionManual ?? "Resources",
    review: labels?.review ?? "Review",
    reviews: labels?.reviews ?? "Reviews",
    rawSamples: labels?.rawSamples ?? "Raw Samples",
    alternatives: labels?.alternatives ?? "Alternatives",
    creatorVideos: labels?.creatorVideos ?? "Creator Videos",
    articles: labels?.articles ?? "Articles",
  };
  const items: GearSectionNavItem[] = [];

  if (hasStaffVerdictContent(verdict)) {
    items.push({ href: "#staff-verdict", label: resolvedLabels.staffVerdict });
  }

  items.push({ href: "#specs", label: resolvedLabels.specs });

  if (hasInstructionManual) {
    items.push({
      href: "#instruction-manual",
      label: resolvedLabels.instructionManual,
    });
  }

  if (hasEditorialReview) {
    items.push({ href: "#editorial-review", label: resolvedLabels.review });
  }

  if (hasRawSamples) {
    items.push({ href: "#raw-samples", label: resolvedLabels.rawSamples });
  }

  if (hasAlternatives) {
    items.push({ href: "#alternatives", label: resolvedLabels.alternatives });
  }

  if (hasCreatorVideos) {
    items.push({
      href: "#creator-videos",
      label: resolvedLabels.creatorVideos,
    });
  }

  items.push({ href: "#reviews", label: resolvedLabels.reviews });

  if (hasRelatedArticles) {
    items.push({ href: "#related-articles", label: resolvedLabels.articles });
  }

  return items;
}
