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
export function EnvironmentSwitch() {
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

  return (
    <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground has-[[data-state=checked]]:text-violet-600">
      <FlaskConical className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Sandbox</span>
      <Switch checked={env.sandbox} disabled={busy} onCheckedChange={change} aria-label="Sandbox" />
    </label>
  );
}
