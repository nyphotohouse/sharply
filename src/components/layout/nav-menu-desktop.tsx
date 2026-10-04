"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu";
import type { HeaderNavItem } from "~/components/layout/header-model";
import { Spinner } from "~/components/ui/spinner";
import { iconMap } from "~/lib/nav-items";
import { cn } from "~/lib/utils";

type HeaderNavSubItem = NonNullable<HeaderNavItem["items"]>[number];

function NavMenuCardPendingState({ enabled }: { enabled: boolean }) {
  const { pending } = useLinkStatus();

  if (!enabled || !pending) return null;

  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 z-20 flex items-center justify-center"
      data-nav-card-pending-overlay="true"
    >
      <Spinner />
    </span>
  );
}

function NavMenuCard({
  item,
  featured = false,
  featuredContent,
  pendingFeedback = false,
  className,
}: {
  item: HeaderNavSubItem;
  featured?: boolean;
  featuredContent?: ReactNode;
  pendingFeedback?: boolean;
  className?: string;
}) {
  const Icon = item.iconKey ? iconMap[item.iconKey] : null;

  return (
    <Link
      href={item.href}
      data-nav-card-link="true"
      className={cn(
        "group hover:bg-accent/30 hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground relative block no-underline outline-none select-none has-[[data-nav-card-pending-overlay=true]]:pointer-events-none",
        featured
          ? "to-background dark:from-primary/10 dark:to-background relative flex min-h-55 flex-col justify-between overflow-hidden rounded-xl border bg-linear-to-br from-white p-4"
          : "min-h-[96px] space-y-1 rounded-xl border p-3 leading-none",
        className,
      )}
    >
      {featured && featuredContent && (
        <div
          aria-hidden="true"
          data-nav-featured-slot="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-75 transition-opacity group-has-[[data-nav-card-pending-overlay=true]]:opacity-30 [&>*]:h-full [&>*]:w-full [&>*]:max-w-none"
        >
          {featuredContent}
        </div>
      )}
      <NavMenuCardPendingState enabled={pendingFeedback} />
      <div
        className={cn(
          "relative z-10 flex transition-opacity group-has-[[data-nav-card-pending-overlay=true]]:opacity-40",
          featured ? "flex-col items-start gap-3" : "items-center gap-2",
        )}
      >
        {Icon && !featured && (
          <Icon
            className={cn(
              "text-muted-foreground group-hover:text-accent-foreground",
              featured ? "h-7 w-7" : "h-4 w-4",
            )}
          />
        )}
        <div
          className={cn(
            "font-medium",
            featured ? "text-base" : "text-sm leading-none",
          )}
        >
          {item.title}
        </div>
      </div>
      {item.description && (
        <p
          className={cn(
            "text-muted-foreground group-hover:text-accent-foreground relative z-10 line-clamp-3 text-xs leading-snug transition-opacity group-has-[[data-nav-card-pending-overlay=true]]:opacity-40",
            featured && "max-w-[18rem] text-sm leading-relaxed",
          )}
        >
          {item.description}
        </p>
      )}
    </Link>
  );
}

function NavMenuCategory({
  items,
  featuredContent,
  pendingFeedback = false,
}: {
  items: HeaderNavSubItem[];
  featuredContent?: ReactNode;
  pendingFeedback?: boolean;
}) {
  const featuredItem = items.find((item) => item.featured);

  if (!featuredItem) {
    return (
      <div
        data-nav-category-layout="standard"
        className="grid w-[400px] grid-cols-2 gap-2 p-2 md:w-[520px]"
      >
        {items.map((subItem, index) => (
          <NavMenuCard
            key={subItem.title}
            item={subItem}
            pendingFeedback={pendingFeedback}
            className={
              items.length % 2 === 1 && index === items.length - 1
                ? "col-span-2"
                : undefined
            }
          />
        ))}
      </div>
    );
  }

  const regularItems = items.filter((item) => item !== featuredItem);

  return (
    <div
      data-nav-category-layout="featured"
      className={cn(
        "grid w-[400px] gap-1.5 p-1.5 md:w-[520px] md:grid-cols-[minmax(145px,0.8fr)_minmax(0,1.65fr)] lg:w-[680px]",
      )}
    >
      <NavMenuCard
        item={featuredItem}
        featured
        featuredContent={featuredContent}
        pendingFeedback={pendingFeedback}
      />
      <div className="grid grid-cols-2 gap-1.5">
        {regularItems.map((subItem) => (
          <NavMenuCard
            key={subItem.title}
            item={subItem}
            pendingFeedback={pendingFeedback}
          />
        ))}
      </div>
    </div>
  );
}

export function NavMenuDesktop({
  items,
  featuredContent,
}: {
  items: HeaderNavItem[];
  featuredContent?: ReactNode;
}) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        {items.map((item) => {
          if (item.items && item.items.length > 0) {
            // Category with dropdown items still available
            return (
              <NavigationMenuItem key={item.title}>
                <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <NavMenuCategory
                    items={item.items}
                    featuredContent={featuredContent}
                    pendingFeedback={item.pendingFeedback}
                  />
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          } else {
            // Simple link item
            return (
              <NavigationMenuItem key={item.title}>
                <NavigationMenuLink asChild className="rounded-md">
                  <Link
                    href={item.href}
                    className={cn(navigationMenuTriggerStyle())}
                  >
                    {item.title}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
