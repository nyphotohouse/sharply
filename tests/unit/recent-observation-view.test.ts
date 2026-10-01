import { describe, expect, it } from "vitest";
import {
  getNeedsReviewRows,
  getObservationPage,
} from "~/lib/pricing/recent-observation-view";

const rows = Array.from({ length: 23 }, (_, index) => ({
  id: String(index + 1),
  needsReview: index % 4 === 0,
}));

describe("recent observation view helpers", () => {
  it("separates only observations that need review", () => {
    expect(getNeedsReviewRows(rows).map((row) => row.id)).toEqual([
      "1",
      "5",
      "9",
      "13",
      "17",
      "21",
    ]);
  });

  it("returns a bounded page and pagination metadata", () => {
    expect(getObservationPage(rows, 2, 10)).toEqual({
      page: 2,
      totalPages: 3,
      startIndex: 10,
      endIndex: 20,
      rows: rows.slice(10, 20),
    });
    expect(getObservationPage(rows, 9, 10).page).toBe(3);
  });
});
