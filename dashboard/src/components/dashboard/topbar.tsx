"use client";

import { Search, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/lib/stores/ui";
import { useEffect, useState } from "react";
import { NotificationsDropdown } from "./notifications-dropdown";
import { PlanPill } from "./plan-pill";

export function Topbar() {
  const { setTheme, theme } = useTheme();
  const { setCommandOpen } = useUIStore();
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
    <div className="h-16 border-b border-border bg-card px-4 flex items-center gap-4">
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search... (⌘K)"
            className="pl-9"
            onClick={() => setCommandOpen(true)}
            readOnly
          />
        </div>
      </div>

      {/* Actions sit at the far right, apart from search. */}
      <div className="ml-auto flex items-center gap-2">
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
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}