export const UPCOMING_FETCH_WINDOW_HOURS = 24;
export const UPCOMING_FETCH_WINDOW_MS =
  UPCOMING_FETCH_WINDOW_HOURS * 60 * 60 * 1000;

export function getUpcomingFetchCutoff(now = new Date()) {
  return new Date(now.getTime() + UPCOMING_FETCH_WINDOW_MS);
}
