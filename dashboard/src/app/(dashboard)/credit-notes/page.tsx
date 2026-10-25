"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  FileText,
  Check,
  X,
  Ban,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import type { CreditNote } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

const statusVariants = {
  DRAFT: "outline",
  FINALIZED: "default",
  VOIDED: "error",
} as const;

const reasonLabels: Record<CreditNote["reason"], string> = {
  DUPLICATE: "Duplicate",
  PRODUCT_UNSATISFACTORY: "Product Unsatisfactory",
  ORDER_CHANGE: "Order Change",
  OTHER: "Other",
};

export default function CreditNotesPage() {
  const canWrite = useCan("billing.write");
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    invoiceId: "",
    customerId: "",
    amount: "",
    currency: "USD",
    reason: "" as string,
  });

  useEffect(() => {
    loadCreditNotes();
  }, [page, statusFilter]);

  async function loadCreditNotes() {
    try {
      setIsLoading(true);
      const response = await apiClient.creditNotes.list({
        page,
        limit: 10,
        status:
          statusFilter !== "all" ? statusFilter.toUpperCase() : undefined,
      });
      setCreditNotes(response.data || []);
      setTotal(response.meta?.total || 0);
    } catch (error) {
      toast.error("Failed to load credit notes");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setForm({
      invoiceId: "",
      customerId: "",
      amount: "",
      currency: "USD",
      reason: "",
    });
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!form.invoiceId) {
      toast.error("Invoice ID is required");
      return;
    }
    if (!form.customerId) {
      toast.error("Customer ID is required");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (!form.reason) {
      toast.error("Reason is required");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.creditNotes.create({
        invoiceId: form.invoiceId,
        customerId: form.customerId,
        amount: Number(form.amount),
        currency: form.currency,
        reason: form.reason as CreditNote["reason"],
      });
      toast.success("Credit note created");
      setCreateOpen(false);
      loadCreditNotes();
    } catch (error: any) {
      toast.error(error.message || "Failed to create credit note");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinalize(creditNote: CreditNote) {
    try {
      await apiClient.creditNotes.finalize(creditNote.id);
      toast.success("Credit note finalized");
      loadCreditNotes();
    } catch (error: any) {
      toast.error(error.message || "Failed to finalize credit note");
    }
  }

  async function handleVoid(creditNote: CreditNote) {
    if (
      confirm(
        `Are you sure you want to void credit note ${creditNote.id.slice(0, 8)}...?`,
      )
    ) {
      try {
        await apiClient.creditNotes.void(creditNote.id);
        toast.success("Credit note voided");
        loadCreditNotes();
      } catch (error: any) {
        toast.error(error.message || "Failed to void credit note");
      }
    }
  }

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Credit Notes</h1>
          <p className="text-muted-foreground">
            Manage credit notes for invoices
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Credit Note
          </Button>
        )}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 border-b border-border">
        {["all", "DRAFT", "FINALIZED", "VOIDED"].map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium ${
              statusFilter === status
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {status === "all"
              ? "All Credit Notes"
              : status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-md border border-border p-8">
          <div className="animate-shimmer h-96 rounded" />
        </div>
      ) : creditNotes.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No credit notes found</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {creditNotes.map((cn) => (
                    <tr
                      key={cn.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono">
                          {cn.id.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono">
                          {cn.invoice?.invoiceNumber ||
                            `INV-${cn.invoiceId.slice(-8).toUpperCase()}`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium">
                          {cn.customer?.name || cn.customerId.slice(0, 8) + "..."}
                        </p>
                        {cn.customer?.email && (
                          <p className="text-xs text-muted-foreground">
                            {cn.customer.email}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold">
                          {formatCurrency(cn.amount, cn.currency)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="secondary">
                          {reasonLabels[cn.reason] || cn.reason}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={statusVariants[cn.status] as any}
                        >
                          {cn.status.charAt(0) +
                            cn.status.slice(1).toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(cn.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canWrite &&
                          (cn.status === "DRAFT" ||
                            cn.status === "FINALIZED") && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {cn.status === "DRAFT" && (
                                <DropdownMenuItem
                                  onClick={() => handleFinalize(cn)}
                                >
                                  <Check className="mr-2 h-4 w-4" />
                                  Finalize
                                </DropdownMenuItem>
                              )}
                              {(cn.status === "DRAFT" ||
                                cn.status === "FINALIZED") && (
                                <DropdownMenuItem
                                  onClick={() => handleVoid(cn)}
                                  className="text-red-600"
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Void
                                </DropdownMenuItem>
                              )}
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
                Showing {(page - 1) * 10 + 1} to{" "}
                {Math.min(page * 10, total)} of {total} credit notes
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

      {/* Create Credit Note Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Credit Note</DialogTitle>
            <DialogDescription>
              Issue a credit note against an existing invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceId">Invoice ID</Label>
              <Input
                id="invoiceId"
                placeholder="e.g. clx1abc..."
                value={form.invoiceId}
                onChange={(e) =>
                  setForm({ ...form, invoiceId: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer ID</Label>
              <Input
                id="customerId"
                placeholder="e.g. clx2def..."
                value={form.customerId}
                onChange={(e) =>
                  setForm({ ...form, customerId: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v })}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="UGX">UGX</SelectItem>
                    <SelectItem value="KES">KES</SelectItem>
                    <SelectItem value="NGN">NGN</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Select
                value={form.reason}
                onValueChange={(v) => setForm({ ...form, reason: v })}
              >
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DUPLICATE">Duplicate</SelectItem>
                  <SelectItem value="PRODUCT_UNSATISFACTORY">
                    Product Unsatisfactory
                  </SelectItem>
                  <SelectItem value="ORDER_CHANGE">Order Change</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && (
                <BrandMark animated tight className="mr-2 h-4 w-4" />
              )}
              Create Credit Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
