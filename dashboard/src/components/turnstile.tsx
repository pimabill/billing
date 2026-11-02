"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("Could not load Turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

let siteKeyRequest: Promise<string | null> | null = null;

/** The API's Turnstile site key, or null when it doesn't use Turnstile. */
function fetchSiteKey(): Promise<string | null> {
  siteKeyRequest ??= fetch("/api/auth/captcha")
    .then((r) => (r.ok ? r.json() : {}))
    .then((b: { turnstileSiteKey?: string | null }) => b.turnstileSiteKey ?? null)
    .catch(() => null);
  return siteKeyRequest;
}

export interface TurnstileHandle {
  /** Get a fresh token: each one works for a single request. */
  reset: () => void;
}

/**
 * Cloudflare Turnstile, shown only when the API has it on. `onToken` gets
 * the token to send as `captchaToken`, or null while there is none;
 * `onReady(required)` says whether a token is needed at all.
 */
export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void; onReady?: (required: boolean) => void }>(
  function Turnstile({ onToken, onReady }, ref) {
    const container = useRef<HTMLDivElement>(null);
    const widget = useRef<string | null>(null);
    const [failed, setFailed] = useState(false);
    const callbacks = useRef({ onToken, onReady });
    callbacks.current = { onToken, onReady };

    useImperativeHandle(ref, () => ({
      reset: () => {
        callbacks.current.onToken(null);
        if (widget.current) window.turnstile?.reset(widget.current);
      },
    }));

    useEffect(() => {
      let gone = false;
      fetchSiteKey().then(async (siteKey) => {
        if (gone) return;
        callbacks.current.onReady?.(Boolean(siteKey));
        if (!siteKey) return;
        try {
          await loadScript();
        } catch {
          if (!gone) setFailed(true);
          return;
        }
        if (gone || !container.current || !window.turnstile) return;
        widget.current = window.turnstile.render(container.current, {
          sitekey: siteKey,
          theme: "auto",
          size: "flexible",
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => callbacks.current.onToken(null),
        });
      });
      return () => {
        gone = true;
        if (widget.current) window.turnstile?.remove(widget.current);
        widget.current = null;
      };
    }, []);

    if (failed) {
      return <p className="text-sm text-destructive">The check that you are human could not load. Check your connection and reload the page.</p>;
    }
    return <div ref={container} className="min-h-0 empty:hidden" />;
  },
);
