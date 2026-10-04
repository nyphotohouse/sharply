import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const linkStatusMocks = vi.hoisted(() => ({
  pending: [] as boolean[],
  useLinkStatus: vi.fn(() => ({
    pending: linkStatusMocks.pending.shift() ?? false,
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

vi.mock("~/components/ui/navigation-menu", () => {
  const render =
    (tag: "nav" | "ul" | "li" | "div" | "button") =>
    ({
      children,
      ...props
    }: ComponentProps<"div"> & { children?: ReactNode }) =>
      createElement(tag, props, children);

  return {
    NavigationMenu: render("nav"),
    NavigationMenuContent: render("div"),
    NavigationMenuItem: render("li"),
    NavigationMenuLink: render("div"),
    NavigationMenuList: render("ul"),
    NavigationMenuTrigger: render("button"),
    navigationMenuTriggerStyle: () => "",
  };
});

import { NavMenuDesktop } from "~/components/layout/nav-menu-desktop";
import type { HeaderNavItem } from "~/components/layout/header-model";

const featuredItems: HeaderNavItem[] = [
  {
    title: "Gear",
    href: "/gear",
    pendingFeedback: true,
    items: [
      {
        title: "Browse",
        href: "/gear",
        description: "Explore gear",
        iconKey: "camera",
        featured: true,
      },
      {
        title: "Collections",
        href: "/tags",
        description: "Browse lists",
        iconKey: "camera",
      },
      {
        title: "Trending",
        href: "/trending",
        description: "Popular gear",
      },
      {
        title: "Contribute",
        href: "/contribute",
        description: "Help improve gear data",
      },
    ],
  },
];

describe("desktop navigation featured content", () => {
  it("renders the supplied content in a full-card faded background slot", () => {
    const markup = renderToStaticMarkup(
      createElement(NavMenuDesktop, {
        items: featuredItems,
        featuredContent: createElement("div", {
          "data-featured-background": "true",
        }),
      }),
    );

    expect(markup).toContain('data-nav-featured-slot="true"');
    expect(markup).toContain('data-featured-background="true"');
    expect(markup).toContain("absolute");
    expect(markup).toContain("inset-0");
    expect(markup).toContain("opacity-75");
    expect(markup.match(/lucide-camera/g)).toHaveLength(1);
  });

  it("keeps Gear cards idle without rendering pending overlays", () => {
    linkStatusMocks.pending = [];

    const markup = renderToStaticMarkup(
      createElement(NavMenuDesktop, { items: featuredItems }),
    );

    expect(markup.match(/data-nav-card-link="true"/g)).toHaveLength(4);
    expect(markup).not.toContain('data-nav-card-pending-overlay="true"');
  });

  it("centers an overlay only over the pending Gear card", () => {
    linkStatusMocks.pending = [true, false, false, false];

    const markup = renderToStaticMarkup(
      createElement(NavMenuDesktop, { items: featuredItems }),
    );

    expect(markup.match(/data-nav-card-pending-overlay="true"/g)).toHaveLength(
      1,
    );
    expect(markup).toContain(
      "absolute inset-0 z-20 flex items-center justify-center",
    );
    expect(markup).toContain("animate-spin");
    expect(markup).toContain(
      "group-has-[[data-nav-card-pending-overlay=true]]:opacity-40",
    );
    expect(markup).toContain(
      "has-[[data-nav-card-pending-overlay=true]]:pointer-events-none",
    );
  });

  it("does not enable card overlays for other dropdown categories", () => {
    linkStatusMocks.pending = [true];

    const markup = renderToStaticMarkup(
      createElement(NavMenuDesktop, {
        items: [
          {
            title: "Tools",
            href: "#",
            items: [{ title: "Compare", href: "/compare" }],
          },
        ],
      }),
    );

    expect(markup).not.toContain('data-nav-card-pending-overlay="true"');
  });

  it("does not place featured content in categories without a featured item", () => {
    const markup = renderToStaticMarkup(
      createElement(NavMenuDesktop, {
        items: [
          {
            title: "About",
            href: "/about",
            items: [
              {
                title: "Mission",
                href: "/about",
                description: "Our mission",
              },
            ],
          },
        ],
        featuredContent: createElement("div", {
          "data-featured-background": "true",
        }),
      }),
    );

    expect(markup).not.toContain('data-nav-featured-slot="true"');
    expect(markup).not.toContain('data-featured-background="true"');
  });
});
