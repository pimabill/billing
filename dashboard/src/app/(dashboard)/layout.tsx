"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { AccessBanner } from "@/components/dashboard/access-banner";
import { CommandPalette } from "@/components/command-palette";
import { useUIStore } from "@/lib/stores/ui";
import { useAuthStore } from "@/lib/stores/auth";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { BrandLoader } from "@/components/brand-mark";
import { SecurityPanel } from "@/components/settings/security-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { mobileNavOpen, setMobileNavOpen } = useUIStore();
  const pathname = usePathname();
  const { isAuthenticated, checkSession, user } = useAuthStore();
  const router = useRouter();
  // The session lives in the browser, so the server always renders signed out:
  // render nothing session-dependent until mounted, or hydration fails.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

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
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-60 gap-0 border-r-0 p-0 [&>button]:hidden">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar mobile />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar />
          <AccessBanner />
          <main className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8">
              {user?.mfa?.required && !user.mfa.enabled ? (
                // The organisation requires two-step sign-in: nothing else opens until it is on.
                <div className="mx-auto max-w-3xl space-y-4">
                  <div>
                    <h1 className="text-[22px] font-semibold tracking-tight">Turn on two-step sign-in</h1>
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
