"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import type { Payment } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { ProviderLogo } from "@/components/provider-logo";
import { BrandMark } from "@/components/brand-mark";

const statusColors = {
  succeeded: "success",
  failed: "error",
  pending: "warning",
  refunded: "outline",
} as const;


export default function PaymentsPage() {
  const canWrite = useCan("billing.write");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Refund dialog state
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: "", reason: "", recordOnly: false });
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    loadPayments();
  }, [page, statusFilter, providerFilter]);

  async function loadPayments() {
    try {
      setIsLoading(true);
      const response = await apiClient.payments.list({
        page,
        limit: 10,
        status: statusFilter,
        provider: providerFilter,
      });
      setPayments(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error("Failed to load payments");
    } finally {
      setIsLoading(false);
    }
  }

  function openRefundDialog(payment: Payment) {
    setRefundTarget(payment);
    setRefundForm({ amount: "", reason: "", recordOnly: false });
    setRefundOpen(true);
  }

  async function handleRefund() {
    if (!refundTarget) return;
    setIsRefunding(true);
    try {
      const data: { amount?: number; reason?: string; recordOnly?: boolean } = {};
      if (refundForm.amount) data.amount = Number(refundForm.amount);
      if (refundForm.reason) data.reason = refundForm.reason;
      if (refundForm.recordOnly) data.recordOnly = true;
      await apiClient.payments.refund(refundTarget.id, data);
      toast.success(refundForm.recordOnly ? "Refund recorded" : "Refund sent to the payment provider");
      setRefundOpen(false);
      loadPayments();
    } catch (error: any) {
      toast.error(error.message || "Failed to refund payment");
    } finally {
      setIsRefunding(false);
    }
  }

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Payments</h1>
        <p className="text-muted-foreground">Track all payment transactions</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>

        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="flutterwave">Flutterwave</SelectItem>
            <SelectItem value="paystack">Paystack</SelectItem>
            <SelectItem value="dpo">DPO Group</SelectItem>
            <SelectItem value="payu">PayU</SelectItem>
            <SelectItem value="pesapal">Pesapal</SelectItem>
            <SelectItem value="paypal">PayPal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-md border border-border p-8">
          <div className="animate-shimmer h-96 rounded" />
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <p className="text-muted-foreground">No payments found</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Transaction ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono">
                          {payment.transactionId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium">
                          {payment.customerName}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono">
                          {payment.invoiceNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold">
                          {formatCurrency(payment.amount, payment.currency)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <ProviderLogo code={payment.provider} size="sm" />
                          <span className="text-sm capitalize">
                            {payment.provider}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={statusColors[payment.status] as any}>
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(payment.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canWrite && payment.status === "succeeded" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openRefundDialog(payment)}
                              >
                                Refund
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of{" "}
                {total} payments
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Refund Dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Payment</DialogTitle>
            <DialogDescription>
              Refund{" "}
              {refundTarget &&
                formatCurrency(refundTarget.amount, refundTarget.currency)}{" "}
              to {refundTarget?.customerName}. Leave amount empty for a full
              refund.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Amount (optional, leave empty for full refund)</Label>
              <Input
                type="number"
                placeholder={refundTarget ? String(refundTarget.amount) : ""}
                value={refundForm.amount}
                onChange={(e) =>
                  setRefundForm({ ...refundForm, amount: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Reason for refund..."
                value={refundForm.reason}
                onChange={(e) =>
                  setRefundForm({ ...refundForm, reason: e.target.value })
                }
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                id="refund-record-only"
                type="checkbox"
                className="mt-1"
                checked={refundForm.recordOnly}
                onChange={(e) =>
                  setRefundForm({ ...refundForm, recordOnly: e.target.checked })
                }
              />
              <span>
                I already refunded this payment elsewhere — only record it
                <span className="block text-xs text-muted-foreground">
                  Otherwise the refund is sent to the payment provider now.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRefund}
              disabled={isRefunding}
            >
              {isRefunding && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Refund Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
