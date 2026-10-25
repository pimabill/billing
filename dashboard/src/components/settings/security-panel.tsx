"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { mfaApi, type MfaStatus } from "@/lib/api/mfa";
import { useAuthStore } from "@/lib/stores/auth";
import { useCan } from "@/lib/permissions";
import { brand } from "@/lib/brand";

type Step = { kind: "idle" } | { kind: "scan"; secret: string; qr: string } | { kind: "codes"; codes: string[] } | { kind: "disable" } | { kind: "regenerate" };

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Two-step sign-in for the signed-in person, and (for owners and admins) requiring it for everyone. */
export function SecurityPanel({ onEnabled }: { onEnabled?: () => void }) {
  const { user, checkSession } = useAuthStore();
  const canManageOrg = useCan("org.manage");
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => mfaApi.status().then(setStatus, () => setStatus(null)), []);
  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setStep({ kind: "idle" });
    setCode("");
    setPassword("");
  };

  const run = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(message(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const { secret, otpauthUrl } = await mfaApi.setup();
      const qr = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 });
      setStep({ kind: "scan", secret, qr });
    }, "Could not start setting up");

  const enable = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { recoveryCodes } = await mfaApi.enable(code);
      setCode("");
      setStep({ kind: "codes", codes: recoveryCodes });
      await load();
      await checkSession();
    }, "That code is not right");
  };

  const disable = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await mfaApi.disable(password, code);
      toast.success("Two-step sign-in is off");
      reset();
      await load();
      await checkSession();
    }, "Could not turn it off");
  };

  const regenerate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { recoveryCodes } = await mfaApi.recoveryCodes(code);
      setCode("");
      setStep({ kind: "codes", codes: recoveryCodes });
      await load();
    }, "That code is not right");
  };

  const setRequired = (required: boolean) =>
    run(async () => {
      const r = await mfaApi.requireForOrganisation(required);
      toast.success(
        required
          ? r.membersWithout
            ? `Required. ${r.membersWithout} member${r.membersWithout === 1 ? "" : "s"} will be asked to turn it on.`
            : "Required for everyone"
          : "No longer required",
      );
      await checkSession();
    }, "Could not change this");

  const codesText = (codes: string[]) => `${brand.name} recovery codes for ${user?.email ?? ""}\nEach works once.\n\n${codes.join("\n")}\n`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Two-step sign-in
            {status?.enabled ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>}
          </CardTitle>
          <CardDescription>After your password, sign-in asks for a code from an authenticator app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step.kind === "idle" && !status?.enabled && (
            <Button onClick={start} isLoading={busy}>
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
              Turn on
            </Button>
          )}

          {step.kind === "scan" && (
            <form onSubmit={enable} className="grid gap-6 md:grid-cols-[200px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.qr} alt="QR code to add this account to your authenticator app" width={200} height={200} className="rounded-md border bg-white" />
              <div className="space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Scan the QR code with your authenticator app.</li>
                  <li>Can&apos;t scan it? Enter this key instead:</li>
                </ol>
                <code className="block break-all rounded bg-muted px-3 py-2 font-mono text-sm">{step.secret.match(/.{1,4}/g)?.join(" ")}</code>
                <div className="space-y-2">
                  <Label htmlFor="mfa-code">Then enter the 6-digit code the app shows</Label>
                  <Input id="mfa-code" className="max-w-[12rem]" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} required />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" isLoading={busy}>
                    Turn on
                  </Button>
                  <Button type="button" variant="ghost" onClick={reset}>
                    Cancel
                  </Button>
                </div>
              </div>
            </form>
          )}

          {step.kind === "codes" && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>Save these recovery codes now.</strong> They will not be shown again. Each one signs you in once if you lose your phone.
              </p>
              <ul className="grid max-w-md grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm">
                {step.codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(codesText(step.codes)).then(() => toast.success("Copied"))}
                >
                  <Copy className="mr-2 h-4 w-4" aria-hidden />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = URL.createObjectURL(new Blob([codesText(step.codes)], { type: "text/plain" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${brand.fileSlug}-recovery-codes.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden />
                  Download
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    reset();
                    onEnabled?.();
                  }}
                >
                  I&apos;ve saved them
                </Button>
              </div>
            </div>
          )}

          {step.kind === "idle" && status?.enabled && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                On since {status.enabledAt ? new Date(status.enabledAt).toLocaleDateString() : "—"} · {status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? "" : "s"} left
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep({ kind: "regenerate" })}>
                  New recovery codes
                </Button>
                {!user?.mfa?.required && (
                  <Button variant="outline" size="sm" onClick={() => setStep({ kind: "disable" })}>
                    <ShieldOff className="mr-2 h-4 w-4" aria-hidden />
                    Turn off
                  </Button>
                )}
              </div>
            </div>
          )}

          {(step.kind === "disable" || step.kind === "regenerate") && (
            <form onSubmit={step.kind === "disable" ? disable : regenerate} className="max-w-sm space-y-3">
              {step.kind === "disable" && (
                <div className="space-y-2">
                  <Label htmlFor="mfa-password">Your password</Label>
                  <Input id="mfa-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="mfa-confirm">A code from your app, or a recovery code</Label>
                <Input id="mfa-confirm" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
              {step.kind === "regenerate" && <p className="text-xs text-muted-foreground">Your old recovery codes stop working.</p>}
              <div className="flex gap-2">
                <Button type="submit" variant={step.kind === "disable" ? "destructive" : "default"} isLoading={busy}>
                  {step.kind === "disable" ? "Turn off" : "Make new codes"}
                </Button>
                <Button type="button" variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {canManageOrg && (
        <Card>
          <CardHeader>
            <CardTitle>Require two-step sign-in</CardTitle>
            <CardDescription>
              Everyone in {user?.tenantName ?? "this organisation"} must turn it on. Until they do, they can only set it up. You need it on yourself first.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Switch
              id="require-mfa"
              checked={Boolean(user?.mfa?.required)}
              disabled={busy || (!status?.enabled && !user?.mfa?.required)}
              onCheckedChange={setRequired}
            />
            <Label htmlFor="require-mfa">{user?.mfa?.required ? "Required for everyone" : "Not required"}</Label>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
