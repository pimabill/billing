"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SandboxBanner } from "@/components/sandbox-banner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SandboxBanner />
      {children}
      <Toaster position="top-right" richColors />
    </ThemeProvider>
  );
}
