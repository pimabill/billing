"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Download,
  MoreHorizontal,
  X as XIcon,
  ExternalLink,
  FileText,
  CheckCircle,
  CreditCard,
  Mail,
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
import { formatDate, isOverdue } from "@/lib/utils/date";
import type { Invoice, Customer, PaymentProvider } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { ChargeDialog } from "@/components/charge-dialog";
import { BrandMark } from "@/components/brand-mark";

const statusColors = {
  draft: "secondary",
  pending: "warning",
  paid: "success",
  failed: "error",
  canceled: "outline",
} as const;

interface LineItemForm {
  description: string;
  quantity: string;
  unitPrice: string;
}

export default function InvoicesPage() {
  const [charging, setCharging] = useState(false);
  const canWrite = useCan("billing.write");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({
    customerId: "",
    dueDate: "",
  });
  const [lineItems, setLineItems] = useState<LineItemForm[]>([
    { description: "", quantity: "1", unitPrice: "" },
  ]);

  // Send email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState<Invoice | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Mark paid dialog state
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const [markPaidInvoice, setMarkPaidInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Checkout provider selection dialog state
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [checkoutInvoice, setCheckoutInvoice] = useState<Invoice | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<PaymentProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [isGeneratingCheckout, setIsGeneratingCheckout] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [page, statusFilter]);

  async function loadInvoices() {
    try {
      setIsLoading(true);
      const response = await apiClient.invoices.list({
        page,
        limit: 10,
        status: statusFilter,
      });
      setInvoices(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error("Failed to load invoices");
    } finally {
      setIsLoading(false);
    }
  }

  async function openCreateDialog() {
    setForm({ customerId: "", dueDate: "" });
    setLineItems([{ description: "", quantity: "1", unitPrice: "" }]);
    setCreateOpen(true);
    try {
      const custRes = await apiClient.customers.list({ limit: 100 });
      setCustomers(custRes.data);
    } catch {
      toast.error("Failed to load customers");
    }
  }

  function addLineItem() {
    setLineItems([
      ...lineItems,
      { description: "", quantity: "1", unitPrice: "" },
    ]);
  }

  function removeLineItem(index: number) {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function updateLineItem(
    index: number,
    field: keyof LineItemForm,
    value: string,
  ) {
    const items = [...lineItems];
    items[index] = { ...items[index], [field]: value };
    setLineItems(items);
  }

  async function handleCreate() {
    if (!form.customerId) {
      toast.error("Customer is required");
      return;
    }
    if (!form.dueDate) {
      toast.error("Due date is required");
      return;
    }
    const validItems = lineItems.filter((li) => li.description && li.unitPrice);
    if (validItems.length === 0) {
      toast.error("At least one line item is required");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.invoices.create({
        customerId: form.customerId,
        dueDate: form.dueDate,
        lineItems: validItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity) || 1,
          unitPrice: Number(li.unitPrice),
          amount: (Number(li.quantity) || 1) * Number(li.unitPrice),
        })),
      });
      toast.success("Invoice created");
      setCreateOpen(false);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setIsSaving(false);
    }
  }

  function openMarkPaidDialog(invoice: Invoice) {
    setMarkPaidInvoice(invoice);
    setPaymentMethod("cash");
    setPaidAmount(String(invoice.amount - invoice.amountPaid));
    setMarkPaidDialogOpen(true);
  }

  async function handleMarkPaid() {
    if (!markPaidInvoice) return;
    setIsMarkingPaid(true);
    try {
      const due = markPaidInvoice.amount - markPaidInvoice.amountPaid;
      const amount = Number(paidAmount);
      const part = amount > 0 && amount < due;
      await apiClient.invoices.markPaid(markPaidInvoice.id, paymentMethod, part ? amount : undefined);
      toast.success(part ? "Part payment recorded" : "Invoice marked as paid");
      setMarkPaidDialogOpen(false);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.message || "Failed to mark invoice as paid");
    } finally {
      setIsMarkingPaid(false);
    }
  }

  async function handleVoid(invoice: Invoice) {
    if (
      confirm(`Are you sure you want to void invoice ${invoice.invoiceNumber}?`)
    ) {
      try {
        await apiClient.invoices.update(invoice.id, { status: "canceled" });
        toast.success("Invoice voided");
        loadInvoices();
      } catch (error: any) {
        toast.error(error.message || "Failed to void invoice");
      }
    }
  }

  async function handleFinalize(invoice: Invoice) {
    try {
      await apiClient.invoices.finalize(invoice.id);
      toast.success("Invoice finalized");
      loadInvoices();
    } catch (error: any) {
      toast.error(error.message || "Failed to finalize invoice");
    }
  }

  async function handleCheckout(invoice: Invoice) {
    try {
      const providers = await apiClient.providers.list();
      const active = providers.filter((p) => p.isConfigured && p.isActive);
      setCheckoutInvoice(invoice);
      setConfiguredProviders(active);
      setSelectedProvider(active[0]?.code ?? "");
      setCheckoutDialogOpen(true);
    } catch {
      // If loading providers fails, fall back to default provider
      await runCheckout(invoice, undefined);
    }
  }

  async function runCheckout(invoice: Invoice, providerName: string | undefined) {
    setIsGeneratingCheckout(true);
    try {
      const result = await apiClient.invoices.checkout(invoice.id, undefined, providerName);
      if (result.checkoutUrl) {
        toast.success(`Checkout URL generated via ${result.provider}`);
        window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate checkout URL");
    } finally {
      setIsGeneratingCheckout(false);
      setCheckoutDialogOpen(false);
    }
  }

  function openEmailDialog(invoice: Invoice) {
    setEmailInvoice(invoice);
    setRecipientEmail(invoice.customerEmail || "");
    setEmailDialogOpen(true);
  }

  async function handleSendEmail() {
    if (!emailInvoice) return;
    setIsSendingEmail(true);
    try {
      await apiClient.invoices.sendEmail(
        emailInvoice.id,
        recipientEmail || undefined,
      );
      toast.success(
        recipientEmail
          ? `Invoice sent to ${recipientEmail}`
          : "Invoice sent to customer",
      );
      setEmailDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to send invoice email");
    } finally {
      setIsSendingEmail(false);
    }
  }

  async function handleDownloadPdf(invoice: Invoice) {
    try {
      // The PDF endpoint now returns binary PDF directly via proxy
      const pdfUrl = `/api/proxy/invoices/${invoice.id}/pdf`;
      window.open(pdfUrl, "_blank");
    } catch (error: any) {
      toast.error(error.message || "Failed to get PDF");
    }
  }

  const totalPages = Math.ceil(total / 10);
  const invoiceTotal = lineItems.reduce(
    (sum, li) => sum + (Number(li.quantity) || 1) * (Number(li.unitPrice) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">Manage and track invoices</p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCharging(true)}>
            Charge a customer
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Invoice
          </Button>
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 border-b border-border">
        {["all", "pending", "paid", "failed"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              statusFilter === status
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {status === "all" ? "All Invoices" : status}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-md border border-border p-8">
          <div className="animate-shimmer h-96 rounded" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <p className="text-muted-foreground">No invoices found</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Paid Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {invoices.map((invoice) => {
                    const overdue =
                      invoice.status === "pending" &&
                      isOverdue(invoice.dueDate);

                    return (
                      <tr
                        key={invoice.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono font-medium">
                            {invoice.invoiceNumber}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">
                            {invoice.customerName}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={statusColors[invoice.status] as any}>
                            {invoice.status === "pending" && invoice.amountPaid > 0 ? "partially paid" : invoice.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold">
                            {formatCurrency(invoice.amount, invoice.currency)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm">
                              {formatDate(invoice.dueDate)}
                            </p>
                            {overdue && (
                              <p className="text-xs text-red-600">Overdue</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {invoice.paidDate
                            ? formatDate(invoice.paidDate)
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleDownloadPdf(invoice)}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Download PDF
                              </DropdownMenuItem>
                              {canWrite && (
                                <DropdownMenuItem
                                  onClick={() => openEmailDialog(invoice)}
                                >
                                  <Mail className="mr-2 h-4 w-4" />
                                  Send Email
                                </DropdownMenuItem>
                              )}
                              {canWrite && invoice.status === "pending" && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleCheckout(invoice)}
                                  >
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Generate Checkout URL
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openMarkPaidDialog(invoice)}
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Mark as Paid
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleVoid(invoice)}
                                    className="text-red-600"
                                  >
                                    Void Invoice
                                  </DropdownMenuItem>
                                </>
                              )}
                              {canWrite && invoice.status === "failed" && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleCheckout(invoice)}
                                  >
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Retry via Checkout
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleVoid(invoice)}
                                    className="text-red-600"
                                  >
                                    Void Invoice
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of{" "}
                {total} invoices
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

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>
              Create a new invoice with line items.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={form.customerId}
                onValueChange={(v) => setForm({ ...form, customerId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <Label>Line Items</Label>
              {lineItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    placeholder="Description"
                    className="flex-1"
                    value={item.description}
                    onChange={(e) =>
                      updateLineItem(i, "description", e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    className="w-[70px]"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(i, "quantity", e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    className="w-[100px]"
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateLineItem(i, "unitPrice", e.target.value)
                    }
                  />
                  {lineItems.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLineItem(i)}
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLineItem}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Item
              </Button>
            </div>

            {invoiceTotal > 0 && (
              <div className="text-right pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground">Total: </span>
                <span className="text-lg font-bold">
                  {invoiceTotal.toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Invoice Email</DialogTitle>
            <DialogDescription>
              Send invoice {emailInvoice?.invoiceNumber} to an email address.
              Leave blank to send to the customer&apos;s email on file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Recipient Email (optional)</Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If left empty, the invoice will be sent to the customer&apos;s
                registered email.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={isSendingEmail}>
              {isSendingEmail && (
                <BrandMark animated tight className="mr-2 h-4 w-4" />
              )}
              <Mail className="mr-2 h-4 w-4" />
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Dialog */}
      <Dialog open={markPaidDialogOpen} onOpenChange={setMarkPaidDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Invoice as Paid</DialogTitle>
            <DialogDescription>
              Record a payment for invoice {markPaidInvoice?.invoiceNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="manual">Other / Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {markPaidInvoice && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  <span className="font-bold">
                    {formatCurrency(markPaidInvoice.amount, markPaidInvoice.currency)}
                  </span>
                </p>
                {markPaidInvoice.amountPaid > 0 && (
                  <p>
                    <span className="text-muted-foreground">Already paid:</span>{" "}
                    {formatCurrency(markPaidInvoice.amountPaid, markPaidInvoice.currency)}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="paid-amount">Amount received</Label>
              <Input
                id="paid-amount"
                type="number"
                min="0"
                step="any"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Less than what's due records a deposit or instalment; the invoice stays open for the rest.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMarkPaidDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleMarkPaid} disabled={isMarkingPaid}>
              {isMarkingPaid && (
                <BrandMark animated tight className="mr-2 h-4 w-4" />
              )}
              <CheckCircle className="mr-2 h-4 w-4" />
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Provider Selection Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Checkout URL</DialogTitle>
            <DialogDescription>
              {configuredProviders.length > 1
                ? "Select a payment provider to use for this invoice."
                : configuredProviders.length === 1
                  ? `Will use ${configuredProviders[0].name} as the payment provider.`
                  : "No active payment providers configured. Please configure one first."}
            </DialogDescription>
          </DialogHeader>

          {configuredProviders.length > 0 && (
            <div className="py-2">
              <Label htmlFor="checkout-provider">Payment Provider</Label>
              <Select
                value={selectedProvider}
                onValueChange={setSelectedProvider}
              >
                <SelectTrigger id="checkout-provider" className="mt-1">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {configuredProviders.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {checkoutInvoice && (
                <p className="text-sm text-muted-foreground mt-2">
                  Invoice {checkoutInvoice.invoiceNumber} —{" "}
                  {formatCurrency(checkoutInvoice.amount, checkoutInvoice.currency)}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutDialogOpen(false)}>
              Cancel
            </Button>
            {configuredProviders.length > 0 && (
              <Button
                onClick={() => checkoutInvoice && runCheckout(checkoutInvoice, selectedProvider || undefined)}
                disabled={isGeneratingCheckout || !selectedProvider}
              >
                {isGeneratingCheckout && <BrandMark animated tight className="mr-2 h-4 w-4" />}
                Generate URL
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ChargeDialog open={charging} onOpenChange={setCharging} onDone={() => loadInvoices()} />
    </div>
  );
}
