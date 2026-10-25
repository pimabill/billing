"use client";

import { useEffect, useState } from "react";

export interface EnvironmentState {
  /** The browser is looking at sandbox data. */
  sandbox: boolean;
  /** This dashboard can switch between live and sandbox. */
  canSwitch: boolean;
}

let cached: Promise<EnvironmentState> | null = null;

/** /api/environment, fetched once per page load and shared by the banner and the switch. */
export function useEnvironment(): EnvironmentState | null {
  const [env, setEnv] = useState<EnvironmentState | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/environment")
      .then((r) => (r.ok ? r.json() : { sandbox: false, canSwitch: false }))
      .catch(() => ({ sandbox: false, canSwitch: false }));
    let live = true;
    cached.then((v) => live && setEnv(v));
    return () => {
      live = false;
    };
  }, []);
  return env;
}
