import { describe, expect, it } from "vitest";
import {
  getUpcomingFetchCutoff,
  UPCOMING_FETCH_WINDOW_HOURS,
} from "~/lib/pricing/upcoming-fetch-window";

describe("upcoming fetch window", () => {
  it("uses a one-day horizon for the daily scheduler queue", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");

    expect(UPCOMING_FETCH_WINDOW_HOURS).toBe(24);
    expect(getUpcomingFetchCutoff(now)).toEqual(
      new Date("2026-10-02T12:00:00.000Z"),
    );
  });
});
