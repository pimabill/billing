"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiClient } from "@/lib/api/client";
import { roleLabels } from "@/lib/permissions";
import { useAuthStore } from "@/lib/stores/auth";
import { BrandMark } from "@/components/brand-mark";

type Invite = Awaited<ReturnType<typeof apiClient.auth.describeInvitation>>;

/** Join an organisation from an invitation link. */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const applySession = useAuthStore((s) => s.applySession);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  // Shown once the account turns out to use two-step sign-in.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    apiClient.auth.describeInvitation(token).then(setInvite, (e: Error) => setError(e.message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      applySession(await apiClient.auth.acceptInvitation(token, password, invite?.existingUser ? undefined : name, needsCode ? code : undefined));
      toast.success(`Welcome to ${invite?.organisation}`);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "MFA_REQUIRED") {
        setNeedsCode(true);
        toast.info("Enter the code from your authenticator app");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not accept the invitation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1 px-0">
          <CardTitle className="text-2xl">{invite ? `Join ${invite.organisation}` : "Invitation"}</CardTitle>
          <CardDescription>
            {invite
              ? `You were invited as ${roleLabels[invite.role.toLowerCase()] ?? invite.role} with ${invite.email}.`
              : (error ?? "Checking your invitation…")}
          </CardDescription>
        </CardHeader>
        {invite && (
          <CardContent className="px-0">
            <form onSubmit={submit} className="space-y-4">
              {!invite.existingUser && (
                <div className="space-y-2">
                  <Label htmlFor="invite-name">Your name</Label>
                  <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="invite-password">{invite.existingUser ? "Your password" : "Choose a password"}</Label>
                <Input
                  id="invite-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={invite.existingUser ? undefined : 8}
                  autoComplete={invite.existingUser ? "current-password" : "new-password"}
                  required
                />
                {invite.existingUser && (
                  <p className="text-xs text-muted-foreground">You already have an account with this email; sign in to add this organisation to it.</p>
                )}
              </div>
              {needsCode && (
                <div className="space-y-2">
                  <Label htmlFor="invite-code">Code from your authenticator app, or a recovery code</Label>
                  <Input id="invite-code" autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
                Join {invite.organisation}
              </Button>
            </form>
          </CardContent>
        )}
    </Card>
  );
}
