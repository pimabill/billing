"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useEnvironment } from "@/lib/environment";

/**
 * Live / sandbox, like a test-mode switch: the same account and organisation,
 * with the sandbox's separate data and sk_test_ keys.
 */
export function EnvironmentSwitch({ collapsed = false }: { collapsed?: boolean }) {
  const env = useEnvironment();
  const [busy, setBusy] = useState(false);
  if (!env?.canSwitch) return null;

  const change = async (sandbox: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/environment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandbox }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not switch");
      }
      // Every page's data belongs to the environment, so start fresh.
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch");
      setBusy(false);
    }
  };

  // Sits with Documentation at the foot of the sidebar; collapsed, only the switch shows.
  return (
    <label
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors has-[[data-state=checked]]:text-violet-600"
      title={collapsed ? (env.sandbox ? "Sandbox: on" : "Sandbox: off") : "Show the sandbox: test data and sk_test_ keys"}
    >
      {!collapsed && <FlaskConical className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
      {!collapsed && <span className="flex-1">Sandbox</span>}
      <Switch checked={env.sandbox} disabled={busy} onCheckedChange={change} aria-label="Sandbox" />
    </label>
  );
}
