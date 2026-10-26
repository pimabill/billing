"use client";

import { useEffect, useState } from "react";
import { Plus, Search, CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CustomerTable } from "@/components/tables/customer-table";
import { apiClient } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import type { Customer, PaymentMethod } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { ChargeDialog } from "@/components/charge-dialog";
import { BrandMark } from "@/components/brand-mark";

export default function CustomersPage() {
  const [charging, setCharging] = useState<Customer | null>(null);
  const canWrite = useCan("billing.write");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    externalId: "",
    country: "",
    currency: "USD",
  });

  // Payment methods dialog
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [pmCustomer, setPmCustomer] = useState<Customer | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [pmLoading, setPmLoading] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, [page, statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        loadCustomers();
      } else {
        setPage(1);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  async function loadCustomers() {
    try {
      setIsLoading(true);
      const response = await apiClient.customers.list({
        page,
        limit: 10,
        search,
        status: statusFilter,
      });
      setCustomers(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error("Failed to load customers");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingCustomer(null);
    setForm({
      name: "",
      email: "",
      externalId: "",
      country: "",
      currency: "USD",
    });
    setDialogOpen(true);
  }

  function openEditDialog(customer: Customer) {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      email: customer.email,
      externalId: customer.externalId,
      country: customer.country,
      currency: customer.currency,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.email) {
      toast.error("Email is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editingCustomer) {
        await apiClient.customers.update(editingCustomer.id, {
          name: form.name,
          email: form.email,
          country: form.country,
        });
        toast.success("Customer updated");
      } else {
        if (!form.externalId) {
          toast.error("External ID is required");
          setIsSaving(false);
          return;
        }
        await apiClient.customers.create({
          name: form.name,
          email: form.email,
          externalId: form.externalId,
          country: form.country,
          currency: form.currency,
        });
        toast.success("Customer created");
      }
      setDialogOpen(false);
      loadCustomers();
    } catch (error: any) {
      toast.error(error.message || "Failed to save customer");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(customer: Customer) {
    if (confirm(`Are you sure you want to delete ${customer.name}?`)) {
      try {
        await apiClient.customers.delete(customer.id);
        toast.success("Customer deleted successfully");
        loadCustomers();
      } catch (error) {
        toast.error("Failed to delete customer");
      }
    }
  }

  async function openPaymentMethods(customer: Customer) {
    setPmCustomer(customer);
    setPmDialogOpen(true);
    setPmLoading(true);
    try {
      const methods = await apiClient.customers.getPaymentMethods(customer.id);
      setPaymentMethods(methods);
    } catch {
      toast.error("Failed to load payment methods");
    } finally {
      setPmLoading(false);
    }
  }

  async function handleDeletePaymentMethod(methodId: string) {
    if (!pmCustomer) return;
    try {
      await apiClient.customers.deletePaymentMethod(pmCustomer.id, methodId);
      setPaymentMethods((prev) => prev.filter((m) => m.id !== methodId));
      toast.success("Payment method removed");
    } catch {
      toast.error("Failed to remove payment method");
    }
  }

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-muted-foreground">Manage your customer base</p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-md border border-border p-8">
          <div className="animate-shimmer h-96 rounded" />
        </div>
      ) : customers.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <p className="text-muted-foreground">No customers found</p>
        </div>
      ) : (
        <>
          <CustomerTable
            customers={customers}
            onEdit={canWrite ? openEditDialog : undefined}
            onDelete={canWrite ? handleDelete : undefined}
            onViewPaymentMethods={openPaymentMethods}
            onCharge={canWrite ? (c) => setCharging(c) : undefined}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of{" "}
                {total} customers
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? "Edit Customer" : "Add Customer"}
            </DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? "Update the customer details below."
                : "Fill in the details to create a new customer."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!editingCustomer && (
              <div className="space-y-2">
                <Label htmlFor="externalId">External ID</Label>
                <Input
                  id="externalId"
                  placeholder="e.g. user_12345"
                  value={form.externalId}
                  onChange={(e) =>
                    setForm({ ...form, externalId: e.target.value })
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Jane Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="customer@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  placeholder="e.g. NG"
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                />
              </div>
              {!editingCustomer && (
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
                      <SelectItem value="NGN">NGN</SelectItem>
                      <SelectItem value="KES">KES</SelectItem>
                      <SelectItem value="GHS">GHS</SelectItem>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                      <SelectItem value="UGX">UGX</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              {editingCustomer ? "Save Changes" : "Create Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Methods Dialog */}
      <Dialog open={pmDialogOpen} onOpenChange={setPmDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Methods
            </DialogTitle>
            <DialogDescription>
              Saved payment methods for {pmCustomer?.name || pmCustomer?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {pmLoading ? (
              <div className="flex items-center justify-center py-8">
                <BrandMark animated tight className="h-8 w-8 text-primary" />
              </div>
            ) : paymentMethods.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No saved payment methods.
                <br />
                <span className="text-xs">Cards are saved automatically after the first successful payment.</span>
              </div>
            ) : (
              paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                      <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {method.brand || method.type} {method.last4 ? `****${method.last4}` : ""}
                        </span>
                        {method.isDefault && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">{method.provider}</span>
                        {method.expMonth && method.expYear && (
                          <>
                            <span>·</span>
                            <span>
                              Exp {String(method.expMonth).padStart(2, "0")}/{method.expYear}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{new Date(method.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      onClick={() => handleDeletePaymentMethod(method.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ChargeDialog open={Boolean(charging)} onOpenChange={(v) => !v && setCharging(null)} customer={charging} />
    </div>
  );
}
