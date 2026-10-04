import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const swrMocks = vi.hoisted(() => ({
  useSWR: vi.fn((): { data: unknown; error: unknown } => ({
    data: undefined,
    error: undefined,
  })),
}));

const linkStatusMocks = vi.hoisted(() => ({
  pending: false,
  useLinkStatus: vi.fn(() => ({
    pending: linkStatusMocks.pending,
  })),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: ComponentProps<"a"> & { children?: ReactNode }) =>
    createElement("a", props, children),
  useLinkStatus: linkStatusMocks.useLinkStatus,
}));

vi.mock("~/components/gear/gear-display-name", () => ({
  GearDisplayName: ({ name }: { name: string }) => name,
}));

vi.mock("swr", () => ({ default: swrMocks.useSWR }));

import {
  TrendingListClient,
  type TrendingListRowItem,
} from "~/components/trending-list.client";
function createTrendingItem(
  overrides: Partial<TrendingListRowItem> = {},
): TrendingListRowItem {
  return {
    gearId: "gear-1",
    slug: "fujifilm-x100vi",
    name: "Fujifilm X100VI",
    regionalAliases: null,
    filled: 3,
    ...overrides,
  };
}

function renderTrendingRow(pending: boolean, liveRefresh = false) {
  linkStatusMocks.pending = pending;

  return renderToStaticMarkup(
    createElement(TrendingListClient, {
      items: [createTrendingItem()],
      liveRefresh,
    }),
  );
}

describe("trending row navigation pending state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swrMocks.useSWR.mockReturnValue({ data: undefined, error: undefined });
  });

  it("renders the row without pending UI by default", () => {
    const markup = renderTrendingRow(false);

    expect(markup).toContain('data-trending-row-pending="false"');
    expect(markup).toContain('data-trending-row-content-pending="false"');
    expect(markup).not.toContain('data-trending-row-pending-overlay="true"');
  });

  it("renders the row with faded text and a right-side spinner while pending", () => {
    const markup = renderTrendingRow(true);

    expect(markup).toContain('data-trending-row-pending="true"');
    expect(markup).toContain('data-trending-row-content-pending="true"');
    expect(markup).toContain('data-trending-row-pending-overlay="true"');
  });

  it("keeps the server list visible when the live refresh fails", () => {
    swrMocks.useSWR.mockReturnValue({
      data: undefined,
      error: new Error("refresh failed"),
    });

    const markup = renderTrendingRow(false, true);

    expect(markup).toContain("Fujifilm X100VI");
    expect(swrMocks.useSWR).toHaveBeenCalledWith(
      "/api/trending/home",
      expect.any(Function),
      expect.objectContaining({
        fallbackData: { items: [createTrendingItem()] },
        keepPreviousData: true,
        refreshInterval: 120_000,
      }),
    );
  });
});
