"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { AccessBanner } from "@/components/dashboard/access-banner";
import { CommandPalette } from "@/components/command-palette";
import { useUIStore } from "@/lib/stores/ui";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/utils/cn";
import { BrandLoader } from "@/components/brand-mark";
import { SecurityPanel } from "@/components/settings/security-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarCollapsed } = useUIStore();
  const { isAuthenticated, checkSession, user } = useAuthStore();
  const router = useRouter();
  // The session lives in the browser, so the server always renders signed out:
  // render nothing session-dependent until mounted, or hydration fails.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Refresh role, permissions and organisations from the API on each visit.
  useEffect(() => {
    if (isAuthenticated) checkSession().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!mounted || !isAuthenticated) {
    return <BrandLoader className="h-screen" />;
  }

  return (
    <>
      <CommandPalette />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar />
          <AccessBanner />
          <main
            className={cn(
              "flex-1 overflow-y-auto bg-muted",
              "transition-all duration-300",
            )}
          >
            <div className="container mx-auto p-6">
              {user?.mfa?.required && !user.mfa.enabled ? (
                // The organisation requires two-step sign-in: nothing else opens until it is on.
                <div className="mx-auto max-w-3xl space-y-4">
                  <div>
                    <h1 className="text-2xl font-bold">Turn on two-step sign-in</h1>
                    <p className="text-sm text-muted-foreground">{user.tenantName ?? "Your organisation"} requires it for everyone. It takes a minute with an authenticator app on your phone.</p>
                  </div>
                  <SecurityPanel />
                </div>
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
