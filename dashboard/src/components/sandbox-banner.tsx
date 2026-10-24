"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";

/** A strip across every page of a sandbox deployment, so test and live are never confused. */
export function SandboxBanner() {
  const [sandbox, setSandbox] = useState(false);

  useEffect(() => {
    fetch("/api/environment")
      .then((r) => (r.ok ? r.json() : { sandbox: false }))
      .then((env: { sandbox?: boolean }) => setSandbox(Boolean(env.sandbox)))
      .catch(() => setSandbox(false));
  }, []);

  if (!sandbox) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-violet-600 px-4 py-1.5 text-center text-xs font-medium text-white">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      Sandbox: test money only. Payments here use provider test accounts and never move real funds.
    </div>
  );
}
