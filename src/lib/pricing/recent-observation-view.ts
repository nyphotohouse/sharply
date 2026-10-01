export const RECENT_OBSERVATIONS_PAGE_SIZE = 10;

export function getNeedsReviewRows<T extends { needsReview: boolean }>(
  rows: readonly T[],
) {
  return rows.filter((row) => row.needsReview);
}

export function getObservationPage<T>(
  rows: readonly T[],
  requestedPage: number,
  pageSize = RECENT_OBSERVATIONS_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, rows.length);

  return {
    page,
    totalPages,
    startIndex,
    endIndex,
    rows: rows.slice(startIndex, endIndex),
  };
}
