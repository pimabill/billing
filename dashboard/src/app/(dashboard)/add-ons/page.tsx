"use client";

import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, X, PuzzleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils/currency";
import type { AddOn } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

const CURRENCIES = [
  "USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "UGX",
  "TZS", "RWF", "XOF", "XAF", "EGP", "MAD", "INR", "BRL",
  "CAD", "AUD", "JPY", "CNY",
];

interface AddOnForm {
  name: string;
  code: string;
  description: string;
  invoiceDisplayName: string;
  prices: { currency: string; amount: string }[];
}

const emptyForm: AddOnForm = {
  name: "",
  code: "",
  description: "",
  invoiceDisplayName: "",
  prices: [{ currency: "USD", amount: "" }],
};

export default function AddOnsPage() {
  const canWrite = useCan("billing.write");
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<AddOnForm>(emptyForm);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAddOn, setDeletingAddOn] = useState<AddOn | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadAddOns();
  }, []);

  async function loadAddOns() {
    try {
      const result = await apiClient.addOns.list({ limit: 100 });
      setAddOns(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error("Failed to load add-ons");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingAddOn(null);
    setForm({
      ...emptyForm,
      prices: [{ currency: "USD", amount: "" }],
    });
    setDialogOpen(true);
  }

  function openEditDialog(addOn: AddOn) {
    setEditingAddOn(addOn);
    setForm({
      name: addOn.name,
      code: addOn.code,
      description: addOn.description || "",
      invoiceDisplayName: addOn.invoiceDisplayName || "",
      prices: addOn.prices.length > 0
        ? addOn.prices.map((p) => ({
            currency: p.currency,
            amount: String(p.amount),
          }))
        : [{ currency: "USD", amount: "" }],
    });
    setDialogOpen(true);
  }

  function confirmDelete(addOn: AddOn) {
    setDeletingAddOn(addOn);
    setDeleteDialogOpen(true);
  }

  function addPrice() {
    setForm({
      ...form,
      prices: [...form.prices, { currency: "", amount: "" }],
    });
  }

  function removePrice(index: number) {
    setForm({ ...form, prices: form.prices.filter((_, i) => i !== index) });
  }

  function updatePrice(
    index: number,
    field: "currency" | "amount",
    value: string
  ) {
    const prices = [...form.prices];
    prices[index] = { ...prices[index], [field]: value };
    setForm({ ...form, prices });
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Add-on name is required");
      return;
    }

    if (!editingAddOn && !form.code.trim()) {
      toast.error("Add-on code is required");
      return;
    }

    const validPrices = form.prices.filter((p) => p.currency && p.amount);
    if (validPrices.length === 0) {
      toast.error("At least one price is required");
      return;
    }

    setIsSaving(true);
    try {
      const pricesPayload = validPrices.map((p) => ({
        currency: p.currency,
        amount: Number(p.amount),
      }));

      if (editingAddOn) {
        await apiClient.addOns.update(editingAddOn.id, {
          name: form.name,
          description: form.description || undefined,
          invoiceDisplayName: form.invoiceDisplayName || undefined,
          prices: pricesPayload,
        });
        toast.success("Add-on updated");
      } else {
        await apiClient.addOns.create({
          name: form.name,
          code: form.code,
          description: form.description || undefined,
          invoiceDisplayName: form.invoiceDisplayName || undefined,
          prices: pricesPayload,
        });
        toast.success("Add-on created");
      }
      setDialogOpen(false);
      loadAddOns();
    } catch (error: any) {
      toast.error(error.message || "Failed to save add-on");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingAddOn) return;
    setIsDeleting(true);
    try {
      await apiClient.addOns.delete(deletingAddOn.id);
      toast.success("Add-on deleted successfully");
      setDeleteDialogOpen(false);
      setDeletingAddOn(null);
      loadAddOns();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete add-on");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-shimmer rounded" />
        <div className="h-96 animate-shimmer rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Add-ons</h1>
          <p className="text-muted-foreground">
            Manage one-time charge add-ons for your customers
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Add-on
          </Button>
        )}
      </div>

      {/* Add-ons Table */}
      {addOns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-accent p-4">
              <PuzzleIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No add-ons yet</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
              Create your first add-on to apply one-time charges to customer
              subscriptions or invoices.
            </p>
            {canWrite && (
              <Button className="mt-6" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Create Add-on
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Add-ons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-4 text-sm font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="pb-3 pr-4 text-sm font-medium text-muted-foreground">
                      Code
                    </th>
                    <th className="pb-3 pr-4 text-sm font-medium text-muted-foreground">
                      Description
                    </th>
                    <th className="pb-3 pr-4 text-sm font-medium text-muted-foreground">
                      Prices
                    </th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {addOns.map((addOn) => (
                    <tr
                      key={addOn.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-md bg-accent p-2">
                            <PuzzleIcon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{addOn.name}</p>
                            {addOn.invoiceDisplayName && (
                              <p className="text-xs text-muted-foreground">
                                Invoice: {addOn.invoiceDisplayName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <code className="rounded bg-muted px-2 py-1 text-sm">
                          {addOn.code}
                        </code>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="text-sm text-muted-foreground max-w-[300px] truncate">
                          {addOn.description || "--"}
                        </p>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap gap-1.5">
                          {addOn.prices.map((price) => (
                            <Badge
                              key={price.id}
                              variant="secondary"
                              className="text-xs"
                            >
                              {formatCurrency(price.amount, price.currency, {
                                showSymbol: true,
                              })}{" "}
                              {price.currency}
                            </Badge>
                          ))}
                          {addOn.prices.length === 0 && (
                            <span className="text-sm text-muted-foreground">
                              --
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 text-right">
                        {canWrite && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(addOn)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete(addOn)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAddOn ? "Edit Add-on" : "Create Add-on"}
            </DialogTitle>
            <DialogDescription>
              {editingAddOn
                ? "Update the add-on details below."
                : "Fill in the details to create a new one-time charge add-on."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="addon-name">Name</Label>
              <Input
                id="addon-name"
                placeholder="e.g. Premium Support"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Code (only on create) */}
            {!editingAddOn && (
              <div className="space-y-2">
                <Label htmlFor="addon-code">Code</Label>
                <Input
                  id="addon-code"
                  placeholder="e.g. premium_support"
                  value={form.code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      code: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                    })
                  }
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="addon-desc">Description</Label>
              <Input
                id="addon-desc"
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>

            {/* Invoice Display Name */}
            <div className="space-y-2">
              <Label htmlFor="addon-invoice-name">
                Invoice Display Name{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="addon-invoice-name"
                placeholder="Name shown on invoices"
                value={form.invoiceDisplayName}
                onChange={(e) =>
                  setForm({ ...form, invoiceDisplayName: e.target.value })
                }
              />
            </div>

            {/* Prices */}
            <div className="space-y-2">
              <Label>Prices</Label>
              {form.prices.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select
                    value={p.currency}
                    onValueChange={(v) => updatePrice(i, "currency", v)}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={p.amount}
                    onChange={(e) => updatePrice(i, "amount", e.target.value)}
                  />
                  {form.prices.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePrice(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPrice}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Price
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              {editingAddOn ? "Save Changes" : "Create Add-on"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Add-on</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deletingAddOn?.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && (
                <BrandMark animated tight className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
