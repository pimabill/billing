"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils/date";
import type { WebhookLog } from "@/types";
import { toast } from "sonner";
import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";

const PROVIDER_LABELS: Record<string, string> = {
  stripe: "Stripe",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  dpo: "DPO Group",
  payu: "PayU",
  pesapal: "Pesapal",
  paypal: "PayPal",
};

function EventBadge({ event }: { event: string }) {
  const label = event
    .replace(/^inbound\.[^.]+\./, "")
    .replace(/\./g, " ");
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
      {label}
    </span>
  );
}

function LogRow({ log }: { log: WebhookLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="px-4 py-3 w-8 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="px-4 py-3">
          {log.success ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </td>
        <td className="px-4 py-3">
          <EventBadge event={log.event} />
        </td>
        {log.direction === "inbound" ? (
          <td className="px-4 py-3 text-sm">
            <Badge variant="outline" className="text-xs capitalize">
              {PROVIDER_LABELS[log.provider ?? ""] ?? log.provider ?? "—"}
            </Badge>
          </td>
        ) : (
          <td className="px-4 py-3 text-sm font-mono text-muted-foreground truncate max-w-xs">
            {log.url}
          </td>
        )}
        <td className="px-4 py-3 text-sm">
          {log.statusCode != null ? (
            <span
              className={
                log.statusCode >= 200 && log.statusCode < 300
                  ? "text-green-600"
                  : "text-destructive"
              }
            >
              {log.statusCode}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(log.createdAt)}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/30 px-4 pb-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-semibold mb-1 text-muted-foreground uppercase tracking-wider">
                  Payload
                </p>
                <pre className="bg-card rounded p-3 overflow-x-auto text-xs border border-border max-h-48">
                  {JSON.stringify(log.payload, null, 2)}
                </pre>
              </div>
              {log.response && (
                <div>
                  <p className="font-semibold mb-1 text-muted-foreground uppercase tracking-wider">
                    Response
                  </p>
                  <pre className="bg-card rounded p-3 overflow-x-auto text-xs border border-border max-h-48">
                    {JSON.stringify(log.response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function LogTable({
  logs,
  direction,
  isLoading,
}: {
  logs: WebhookLog[];
  direction: "inbound" | "outbound";
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <BrandMark animated tight className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">
          No {direction} webhook events recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="w-8 px-4 py-3" />
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Event
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                {direction === "inbound" ? "Provider" : "Destination URL"}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                HTTP
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WebhooksPage() {
  const [inboundLogs, setInboundLogs] = useState<WebhookLog[]>([]);
  const [outboundLogs, setOutboundLogs] = useState<WebhookLog[]>([]);
  const [inboundMeta, setInboundMeta] = useState<any>({});
  const [outboundMeta, setOutboundMeta] = useState<any>({});
  const [loadingInbound, setLoadingInbound] = useState(true);
  const [loadingOutbound, setLoadingOutbound] = useState(true);
  const [inboundPage, setInboundPage] = useState(1);
  const [outboundPage, setOutboundPage] = useState(1);

  useEffect(() => {
    loadInbound();
  }, [inboundPage]);

  useEffect(() => {
    loadOutbound();
  }, [outboundPage]);

  async function loadInbound() {
    try {
      setLoadingInbound(true);
      const res = await apiClient.webhookLogs.list({
        direction: "inbound",
        page: inboundPage,
        limit: 25,
      });
      setInboundLogs(res.data);
      setInboundMeta(res.meta);
    } catch {
      toast.error("Failed to load inbound webhook logs");
    } finally {
      setLoadingInbound(false);
    }
  }

  async function loadOutbound() {
    try {
      setLoadingOutbound(true);
      const res = await apiClient.webhookLogs.list({
        direction: "outbound",
        page: outboundPage,
        limit: 25,
      });
      setOutboundLogs(res.data);
      setOutboundMeta(res.meta);
    } catch {
      toast.error("Failed to load outbound webhook logs");
    } finally {
      setLoadingOutbound(false);
    }
  }

  function refresh() {
    loadInbound();
    loadOutbound();
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground mt-1">
            Monitor inbound events from payment providers and outbound
            deliveries to your configured endpoint.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950">
            <ArrowDownLeft className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Inbound Events</p>
            <p className="text-[22px] font-semibold tracking-tight">
              {loadingInbound ? "—" : (inboundMeta.total ?? 0)}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-950">
            <ArrowUpRight className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Outbound Deliveries</p>
            <p className="text-[22px] font-semibold tracking-tight">
              {loadingOutbound ? "—" : (outboundMeta.total ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="inbound">
        <TabsList>
          <TabsTrigger value="inbound" className="gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            Inbound
            {!loadingInbound && inboundMeta.total > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {inboundMeta.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outbound" className="gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Outbound
            {!loadingOutbound && outboundMeta.total > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {outboundMeta.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Events received from payment providers (Stripe, Paystack, etc.) after
            a customer completes or fails a payment.
          </p>
          <LogTable
            logs={inboundLogs}
            direction="inbound"
            isLoading={loadingInbound}
          />
          {!loadingInbound && inboundMeta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {inboundPage} of {inboundMeta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInboundPage((p) => p - 1)}
                  disabled={inboundPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInboundPage((p) => p + 1)}
                  disabled={inboundPage === inboundMeta.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="outbound" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Events delivered from {brand.name} to your configured webhook
            endpoint. Configure your endpoint in{" "}
            <a href="/settings" className="underline underline-offset-2">
              Settings
            </a>
            .
          </p>
          <LogTable
            logs={outboundLogs}
            direction="outbound"
            isLoading={loadingOutbound}
          />
          {!loadingOutbound && outboundMeta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {outboundPage} of {outboundMeta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOutboundPage((p) => p - 1)}
                  disabled={outboundPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOutboundPage((p) => p + 1)}
                  disabled={outboundPage === outboundMeta.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
