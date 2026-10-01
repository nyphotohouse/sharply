"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { UserRole } from "~/auth";
// import {
//     IconCamera,
//     IconChartBar,
//     IconDashboard,
//     IconDatabase,
//     IconFileAi,
//     IconFileDescription,
//     IconFileWord,
//     IconFolder,
//     IconHelp,
//     IconInnerShadowTop,
//     IconListDetails,
//     IconReport,
//     IconSearch,
//     IconSettings,
//     IconUsers,
//   } from "lucide-react";

// import { NavDocuments } from "~/components/nav-documents";
// import { NavMain } from "~/components/nav-main";
// import { NavSecondary } from "~/components/nav-secondary";
// import { NavUser } from "~/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  BadgeDollarSign,
  Camera,
  CombineIcon,
  HelpCircle,
  ListCheck,
  Lock,
  Plus,
  SquareTerminal,
  Tags,
  Users,
  Video,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { useSession } from "~/lib/auth/auth-client";
import { requireRole } from "~/lib/auth/auth-helpers";
import { GearCreateCard } from "./gear-create";

type SidebarItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  allowed: UserRole[];
};

const sidebarItems: SidebarItem[] = [
  {
    label: "Approvals",
    href: "/admin",
    icon: <CombineIcon className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN", "EDITOR"],
  },
  {
    label: "Gear",
    href: "/admin/gear",
    icon: <Camera className="size-5" />,
    allowed: ["EDITOR", "ADMIN", "SUPERADMIN"],
  },
  {
    label: "Pricing",
    href: "/admin/prices",
    icon: <BadgeDollarSign className="size-5" />,
    allowed: ["EDITOR", "ADMIN", "SUPERADMIN"],
  },
  {
    label: "Tags",
    href: "/admin/tags",
    icon: <Tags className="size-5" />,
    allowed: ["EDITOR", "ADMIN", "SUPERADMIN"],
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: <BarChart3 className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN"],
  },
  {
    label: "Tools",
    href: "/admin/tools",
    icon: <Wrench className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN"],
  },
  {
    label: "Leaderboard",
    href: "/admin/leaderboard",
    icon: <Users className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN", "EDITOR"],
  },
  {
    label: "Creators",
    href: "/admin/approved-creators",
    icon: <Video className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN"],
  },
  {
    label: "Logs",
    href: "/admin/logs",
    icon: <ListCheck className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN", "EDITOR"],
  },
  {
    label: "Help",
    href: "/admin/help",
    icon: <HelpCircle className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN", "EDITOR"],
  },
  {
    label: "Private",
    href: "/admin/private",
    icon: <Lock className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN"],
  },
  {
    label: "developerApi",
    href: "/admin/developer-api",
    icon: <SquareTerminal className="size-5" />,
    allowed: ["ADMIN", "SUPERADMIN"],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("developerApi");
  const createT = useTranslations("gearCreate");
  const { data, isPending, error } = useSession();
  const [createGearOpen, setCreateGearOpen] = React.useState(false);
  const [createGearLoading, setCreateGearLoading] = React.useState(false);

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!data) {
    return <div>Unauthenticated</div>;
  }

  const user = data.user;

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/">
                <span className="text-base font-semibold">Sharply</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="list-none px-4">
        {isPending ? (
          <>
            <Skeleton className="h-8 w-40 rounded-md" />
            {Array.from({ length: sidebarItems.length }).map((_, idx) => (
              <SidebarMenuItem key={`skeleton-${idx}`}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}
          </>
        ) : (
          <>
            <Dialog
              open={createGearOpen}
              onOpenChange={(open) => {
                if (!createGearLoading || open) setCreateGearOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" icon={<Plus className="size-5" />}>
                  Create Gear Item
                </Button>
              </DialogTrigger>
              <DialogContent className="border-none bg-transparent p-0 shadow-none sm:max-w-3xl">
                <DialogTitle className="sr-only">
                  {createT("title")}
                </DialogTitle>
                <GearCreateCard
                  onCreated={() => setCreateGearOpen(false)}
                  onLoadingChange={setCreateGearLoading}
                />
              </DialogContent>
            </Dialog>
            {/* Only show links the user is allowed to see */}
            {sidebarItems
              .filter((item) => requireRole(user, item.allowed))
              .map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    className="data-[slot=sidebar-menu-item]:!p-1.5"
                  >
                    <Link href={item.href}>
                      {item.icon}{" "}
                      {item.label === "developerApi"
                        ? t("admin.navLabel")
                        : item.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </>
        )}
      </SidebarContent>
      <SidebarFooter></SidebarFooter>
    </Sidebar>
  );
}
