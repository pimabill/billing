"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  Receipt,
  CreditCard,
  DollarSign,
  Plug,
  BarChart3,
  Settings,
  Gem,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Tag,
  PuzzleIcon,
  FileText,
  Activity,
  Wallet,
  Calculator,
  SlidersHorizontal,
  Webhook,
  ArrowLeftRight,
  BookOpenCheck,
  UsersRound,
  Check,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/lib/stores/ui";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { brand } from "@/lib/brand";
import { roleLabels } from "@/lib/permissions";
import { NewOrganisationDialog } from "@/components/dashboard/new-organisation-dialog";
import { useState } from "react";
import { EnvironmentSwitch } from "./environment-switch";
import { toast } from "sonner";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    label: "",
    items: [
      { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Customers",
    items: [
      { name: "Customers", href: "/customers", icon: Users },
      { name: "Subscriptions", href: "/subscriptions", icon: Receipt },
      { name: "Wallets", href: "/wallets", icon: Wallet },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Invoices", href: "/invoices", icon: CreditCard },
      { name: "Payments", href: "/payments", icon: DollarSign },
      { name: "Credit Notes", href: "/credit-notes", icon: FileText },
    ],
  },
  {
    label: "Money",
    items: [
      { name: "Money movement", href: "/money", icon: ArrowLeftRight },
      { name: "Ledger", href: "/ledger", icon: BookOpenCheck },
    ],
  },
  {
    label: "Products",
    items: [
      { name: "Plans", href: "/plans", icon: Package },
      { name: "Billable Metrics", href: "/billable-metrics", icon: Activity },
      { name: "Add-ons", href: "/add-ons", icon: PuzzleIcon },
      { name: "Coupons", href: "/coupons", icon: Tag },
    ],
  },
  {
    label: "Configuration",
    items: [
      { name: "Taxes", href: "/taxes", icon: Calculator },
      { name: "Plan Overrides", href: "/plan-overrides", icon: SlidersHorizontal },
      { name: "Providers", href: "/providers", icon: Plug },
      { name: "Webhooks", href: "/webhooks", icon: Webhook },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "Team", href: "/team", icon: UsersRound },
      { name: "Plan", href: "/settings/plan", icon: Gem },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:4003";

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const collapsed = sidebarCollapsed && !mobile;
  const { user, logout, organisations, switchOrganisation } = useAuthStore();
  const [creatingOrg, setCreatingOrg] = useState(false);
  const otherOrgs = organisations.filter((o) => o.id !== user?.tenantId);

  const switchTo = async (tenantId: string) => {
    try {
      await switchOrganisation(tenantId);
      // Every page's data belongs to the organisation, so start fresh.
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch organisation");
    }
  };

  // The most specific matching link wins, so a nested page does not also light up its parent.
  const activeHref = navigation
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div
      className={cn(
        "relative z-20 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src={brand.logo} alt={brand.name} width={32} height={32} className="h-7 w-7 rounded-lg" />
          {!collapsed && (
            <span className="leading-tight">
              <span className="block text-sm font-semibold">{brand.name}</span>
              {user?.tenantName && <span className="block max-w-40 truncate text-xs text-muted-foreground">{user.tenantName}</span>}
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        {navigation.map((group) => (
          <div key={group.label}>
            {!collapsed && group.label && (
              <p className="mb-1 px-2.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.href === activeHref;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Environment and external links */}
      <div className="px-2 pb-2 border-t border-sidebar-border pt-2">
        <EnvironmentSwitch collapsed={collapsed} />
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          title={collapsed ? "Documentation" : undefined}
        >
          <BookOpen className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Documentation</span>}
        </a>
      </div>

      {/* User Profile */}
      <div className="p-2 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors",
                collapsed && "justify-center",
              )}
            >
              <Avatar name={user?.name || "User"} size="sm" />
              {!collapsed && (
                <div className="flex-1 text-left min-w-0">
                  <p className="truncate text-[13px] font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.tenantName ?? user?.email}
                    {user?.role && ` · ${roleLabels[user.role] ?? user.role}`}
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Organisations</DropdownMenuLabel>
            <DropdownMenuItem disabled className="justify-between opacity-100">
              <span className="truncate">{user?.tenantName ?? "Current organisation"}</span>
              <Check className="h-4 w-4" />
            </DropdownMenuItem>
            {otherOrgs.map((org) => (
              <DropdownMenuItem key={org.id} onClick={() => switchTo(org.id)} className="justify-between">
                <span className="truncate">{org.name}</span>
                <span className="text-xs text-muted-foreground">{roleLabels[org.role] ?? org.role}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setCreatingOrg(true)}>
              <Plus className="mr-2 h-4 w-4" /> New organisation
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NewOrganisationDialog open={creatingOrg} onOpenChange={setCreatingOrg} />

      {/* Collapse Toggle */}
      {!mobile && (
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-[18px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

