"use client";

import { Menu, Search, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/stores/ui";
import { useEffect, useState } from "react";
import { NotificationsDropdown } from "./notifications-dropdown";
import { PlanPill } from "./plan-pill";

export function Topbar() {
  const { setTheme, theme } = useTheme();
  const { setCommandOpen, setMobileNavOpen } = useUIStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setCommandOpen]);

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search */}
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md bg-muted px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">Search</span>
        <kbd className="hidden rounded border border-border bg-background px-1 font-sans text-[11px] sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Actions sit at the far right, apart from search. */}
      <div className="ml-auto flex items-center gap-1">
        <PlanPill />
        <NotificationsDropdown />

        {/* Theme Toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}