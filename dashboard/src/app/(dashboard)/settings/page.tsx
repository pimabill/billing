"use client";

import { useEffect, useState } from "react";
import { Save, Copy, RefreshCw, AlertTriangle, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { apiClient } from "@/lib/api/client";
import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { SecurityPanel } from "@/components/settings/security-panel";

function maskApiKey(key: string): string {
  if (!key || key.length < 12) return key;
  return key.slice(0, 8) + "••••••••••••••••••••••••" + key.slice(-4);
}

export default function SettingsPage() {
  const canManageOrg = useCan("org.manage");
  const canManageKeys = useCan("settings.developer");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Tenant profile
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [lastLoginAt, setLastLoginAt] = useState("");
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const webhookEvents = [
    {
      id: "customer.created",
      label: "Customer Created",
      category: "Customers",
    },
    {
      id: "customer.updated",
      label: "Customer Updated",
      category: "Customers",
    },
    {
      id: "subscription.created",
      label: "Subscription Created",
      category: "Subscriptions",
    },
    {
      id: "subscription.updated",
      label: "Subscription Updated",
      category: "Subscriptions",
    },
    {
      id: "subscription.canceled",
      label: "Subscription Canceled",
      category: "Subscriptions",
    },
    { id: "invoice.created", label: "Invoice Created", category: "Invoices" },
    { id: "invoice.paid", label: "Invoice Paid", category: "Invoices" },
    { id: "invoice.failed", label: "Invoice Failed", category: "Invoices" },
    {
      id: "payment.succeeded",
      label: "Payment Succeeded",
      category: "Payments",
    },
    { id: "payment.failed", label: "Payment Failed", category: "Payments" },
  ];

  const [selectedEvents, setSelectedEvents] = useState(
    webhookEvents.map((e) => e.id),
  );

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const profileRes = await fetch("/api/proxy/tenants/me", { credentials: "include" }).then((r) =>
        r.json(),
      );

      const profile = profileRes.data?.data || profileRes.data || profileRes;

      setCompanyName(profile.name || "");
      setSlug(profile.slug || "");
      setEmail(profile.email || "");
      setApiKey(profile.apiKey || "");
      setWebhookUrl(profile.webhookUrl || "");
      setWebhookSecret(profile.webhookSecret || "");
      setLastLoginAt(profile.lastLoginAt || "");
      if (profile.settings?.webhookEvents) {
        setSelectedEvents(profile.settings.webhookEvents);
      }
      if (profile.settings?.smtp) {
        const smtp = profile.settings.smtp;
        setSmtpHost(smtp.host || "");
        setSmtpPort(String(smtp.port || 587));
        setSmtpSecure(smtp.secure || false);
        setSmtpUser(smtp.user || "");
        setSmtpPassword(smtp.password || "");
        setSmtpFrom(smtp.from || "");
        setSmtpFromName(smtp.fromName || "");
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRotateWebhookSecret() {
    if (!confirm("Rotate the webhook secret? Your receiver must use the new secret from the next event.")) return;
    try {
      const res = await fetch("/api/proxy/tenants/me/webhook-secret/rotate", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const data = json.data?.data || json.data || json;
      setWebhookSecret(data.webhookSecret || "");
      setShowWebhookSecret(true);
      toast.success("Webhook secret rotated");
    } catch {
      toast.error("Failed to rotate the webhook secret");
    }
  }

  function handleCopyWebhookSecret() {
    navigator.clipboard.writeText(webhookSecret);
    toast.success("Webhook secret copied to clipboard");
  }

  async function handleSaveGeneral() {
    setIsSaving(true);
    try {
      await fetch("/api/proxy/tenants/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: companyName, email }),
      });
      toast.success("Settings saved successfully");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveWebhook() {
    setIsSaving(true);
    try {
      await fetch("/api/proxy/tenants/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          webhookUrl: webhookUrl || null,
          settings: { webhookEvents: selectedEvents },
        }),
      });
      toast.success("Webhook settings saved");
    } catch {
      toast.error("Failed to save webhook settings");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveSmtp() {
    setIsSaving(true);
    try {
      const smtpSettings: Record<string, unknown> = {};
      if (smtpHost) {
        smtpSettings.host = smtpHost;
        smtpSettings.port = parseInt(smtpPort, 10) || 587;
        smtpSettings.secure = smtpSecure;
        if (smtpUser) smtpSettings.user = smtpUser;
        if (smtpPassword) smtpSettings.password = smtpPassword;
        if (smtpFrom) smtpSettings.from = smtpFrom;
        if (smtpFromName) smtpSettings.fromName = smtpFromName;
      }

      await fetch("/api/proxy/tenants/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          settings: { smtp: Object.keys(smtpSettings).length > 0 ? smtpSettings : null },
        }),
      });
      toast.success("SMTP settings saved");
    } catch {
      toast.error("Failed to save SMTP settings");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestSmtp() {
    if (!testEmailTo) {
      toast.error("Please enter a test email address");
      return;
    }
    setIsTesting(true);
    try {
      const res = await fetch("/api/proxy/tenants/me/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: testEmailTo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "SMTP test failed");
      }
      toast.success(`Test email sent to ${testEmailTo}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send test email");
    } finally {
      setIsTesting(false);
    }
  }

  const groupedEvents = webhookEvents.reduce(
    (acc, event) => {
      if (!acc[event.category]) acc[event.category] = [];
      acc[event.category].push(event);
      return acc;
    },
    {} as Record<string, typeof webhookEvents>,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <BrandMark animated tight className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application settings
        </p>
        {!canManageOrg && !canManageKeys && (
          <p className="text-sm text-muted-foreground">You have view-only access.</p>
        )}
      </div>

      <Tabs defaultValue={(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab")) || "general"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="api">API Keys</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="security" className="space-y-4">
          <SecurityPanel />
        </TabsContent>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>
                Update your company details and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input
                    id="company"
                    readOnly={!canManageOrg}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Tenant Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Unique identifier for your account (read-only)
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    readOnly={!canManageOrg}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {lastLoginAt && (
                  <div className="space-y-2">
                    <Label htmlFor="lastLogin">Last Login</Label>
                    <Input
                      id="lastLogin"
                      value={new Date(lastLoginAt).toLocaleString()}
                      readOnly
                      disabled
                      className="bg-muted"
                    />
                  </div>
                )}
              </div>

              {canManageOrg && (
                <Button onClick={handleSaveGeneral} disabled={isSaving}>
                  {isSaving ? (
                    <BrandMark animated tight className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email / SMTP Settings */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                SMTP Configuration
              </CardTitle>
              <CardDescription>
                Configure your own SMTP server for sending emails. If not
                configured, the system default SMTP will be used.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input
                    id="smtp-host"
                    readOnly={!canManageOrg}
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    readOnly={!canManageOrg}
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Username</Label>
                  <Input
                    id="smtp-user"
                    readOnly={!canManageOrg}
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="user@gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">Password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    readOnly={!canManageOrg}
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="App password or SMTP password"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-from">From Address</Label>
                  <Input
                    id="smtp-from"
                    readOnly={!canManageOrg}
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="billing@yourcompany.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    The sender email address for all outgoing emails
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">Sender Name</Label>
                  <Input
                    id="smtp-from-name"
                    readOnly={!canManageOrg}
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    placeholder="Your Company Name"
                  />
                  <p className="text-xs text-muted-foreground">
                    The display name shown in email clients
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="smtp-secure"
                  disabled={!canManageOrg}
                  checked={smtpSecure}
                  onCheckedChange={(checked) =>
                    setSmtpSecure(checked === true)
                  }
                />
                <Label htmlFor="smtp-secure" className="font-normal cursor-pointer">
                  Use SSL/TLS (port 465)
                </Label>
              </div>

              {canManageOrg && (
                <div className="flex gap-2">
                  <Button onClick={handleSaveSmtp} disabled={isSaving}>
                    {isSaving ? (
                      <BrandMark animated tight className="mr-2 h-4 w-4" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save SMTP Settings
                  </Button>
                  {smtpHost && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSmtpHost("");
                        setSmtpPort("587");
                        setSmtpSecure(false);
                        setSmtpUser("");
                        setSmtpPassword("");
                        setSmtpFrom("");
                        setSmtpFromName("");
                      }}
                    >
                      Reset to System Default
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {canManageOrg && (
            <Card>
              <CardHeader>
                <CardTitle>Test Email</CardTitle>
                <CardDescription>
                  Send a test email using your saved SMTP settings or system default
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="test@example.com"
                    className="max-w-sm"
                  />
                  <Button
                    onClick={handleTestSmtp}
                    disabled={isTesting}
                    variant="outline"
                  >
                    {isTesting ? (
                      <BrandMark animated tight className="mr-2 h-4 w-4" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send Test Email
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {smtpHost
                    ? "This will use your configured SMTP settings above."
                    : 'No custom SMTP configured. Test email will be sent using the system default SMTP.'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Webhook Settings */}
        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Configuration</CardTitle>
              <CardDescription>
                Configure webhooks to receive real-time events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-url"
                    readOnly={!canManageOrg}
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-app.com/webhooks"
                  />
                </div>
              </div>

              {webhookSecret && (
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <div className="flex gap-2">
                    <Input
                      value={showWebhookSecret ? webhookSecret : maskApiKey(webhookSecret)}
                      readOnly
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    >
                      {showWebhookSecret ? "Hide" : "Show"}
                    </Button>
                    <Button variant="outline" onClick={handleCopyWebhookSecret}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use this secret to verify webhook signatures from {brand.name}. Verify the
                    X-Webhook-Signature-V2 header (signs the timestamp too) and reject old timestamps.
                  </p>
                  {canManageKeys && (
                    <Button variant="outline" size="sm" onClick={handleRotateWebhookSecret}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Rotate secret
                    </Button>
                  )}
                </div>
              )}

              <div className="pt-4">
                <h4 className="font-medium mb-3">Event Selection</h4>
                <div className="space-y-4">
                  {Object.entries(groupedEvents).map(([category, events]) => (
                    <div key={category}>
                      <h5 className="text-sm font-medium mb-2">{category}</h5>
                      <div className="space-y-2 pl-4">
                        {events.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={event.id}
                              disabled={!canManageOrg}
                              checked={selectedEvents.includes(event.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedEvents([
                                    ...selectedEvents,
                                    event.id,
                                  ]);
                                } else {
                                  setSelectedEvents(
                                    selectedEvents.filter(
                                      (id) => id !== event.id,
                                    ),
                                  );
                                }
                              }}
                            />
                            <Label
                              htmlFor={event.id}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {event.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canManageOrg && (
                <Button onClick={handleSaveWebhook} disabled={isSaving}>
                  {isSaving ? (
                    <BrandMark animated tight className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Webhook Settings
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys */}
        <TabsContent value="api" className="space-y-4">
          <ApiKeysPanel maskedKey={apiKey || null} canManage={canManageKeys} />
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div>
                <h4 className="font-medium mb-3">API Documentation</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Learn how to integrate {brand.name} into your application
                </p>
                <Button
                  variant="outline"
                  onClick={() => window.open("/docs", "_blank")}
                >
                  View Documentation
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
