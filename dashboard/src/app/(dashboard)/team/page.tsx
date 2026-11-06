"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { teamApi, type ApiRole, type Invitation, type Member } from "@/lib/api/team";
import { can, roleDescriptions, roleLabels } from "@/lib/permissions";
import { useAuthStore } from "@/lib/stores/auth";
import { formatDateTime } from "@/lib/utils/date";
import { BrandMark } from "@/components/brand-mark";

const ROLES: ApiRole[] = ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "VIEWER"];
const label = (role: string) => roleLabels[role.toLowerCase()] ?? role;

export default function TeamPage() {
  const user = useAuthStore((s) => s.user);
  const manage = can(user, "team.manage");
  const isOwner = user?.role === "owner";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ApiRole>("FINANCE");
  const [inviting, setInviting] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([teamApi.members(), manage ? teamApi.invitations() : Promise.resolve([])]);
      setMembers(m);
      setInvitations(i);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the team");
      setMembers([]);
    }
  }, [manage]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const result = await teamApi.invite(email.trim(), role);
      setLastLink(result.acceptUrl);
      setEmail("");
      toast.success(result.emailed ? `Invitation emailed to ${result.email}` : "Invitation created. Email is not set up, so share the link below.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the invitation");
    } finally {
      setInviting(false);
    }
  };

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success("Link copied"),
      () => toast.error("Copy failed; select the link and copy it"),
    );

  // Only owners can hand out or change the owner role.
  const assignable = ROLES.filter((r) => r !== "OWNER" || isOwner);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          People who can sign in to {user?.tenantName ?? "this organisation"}, and what each of them can do.
        </p>
      </div>

      {manage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
            <CardDescription>They get a link to join. People who already have an account sign in with it; new people choose a password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as ApiRole)}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignable.map((r) => (
                      <SelectItem key={r} value={r}>
                        {label(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting}>
                {inviting ? <BrandMark animated tight className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Invite
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">{label(role)}: {roleDescriptions[role.toLowerCase()]}.</p>
            {lastLink && (
              <div className="flex items-center gap-2">
                <Input readOnly value={lastLink} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" size="icon" onClick={() => copy(lastLink)} aria-label="Copy invitation link">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {members === null ? (
            <div className="flex justify-center p-8">
              <BrandMark animated tight className="h-8 w-8 text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Person</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Last sign-in</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const me = m.userId === user?.id;
                    // Admins cannot change owners; nobody changes their own role here.
                    const editable = manage && !me && (m.role !== "OWNER" || isOwner);
                    return (
                      <tr key={m.userId} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium">
                            {m.name} {me && <span className="text-muted-foreground">(you)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          {editable ? (
                            <Select value={m.role} onValueChange={(v) => run(() => teamApi.changeRole(m.userId, v as ApiRole), `${m.name} is now ${label(v)}`)}>
                              <SelectTrigger className="w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {assignable.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {label(r)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={m.role === "OWNER" ? "default" : "secondary"}>{label(m.role)}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : "Never"}</td>
                        <td className="px-4 py-3 text-right">
                          {me ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                run(async () => {
                                  await teamApi.leave();
                                  window.location.href = "/login";
                                }, "You left the organisation")
                              }
                            >
                              Leave
                            </Button>
                          ) : (
                            editable && (
                              <Button variant="ghost" size="icon" aria-label={`Remove ${m.name}`} onClick={() => run(() => teamApi.remove(m.userId), `${m.name} removed`)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {manage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{i.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{label(i.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Invited by {i.invitedBy}, expires {formatDateTime(i.expiresAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => run(() => teamApi.revoke(i.id), "Invitation revoked")}>
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r}>
                <dt className="font-medium">{label(r)}</dt>
                <dd className="text-muted-foreground">{roleDescriptions[r.toLowerCase()]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
