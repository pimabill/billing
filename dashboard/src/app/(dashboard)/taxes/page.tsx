"use client";

import { useEffect, useState } from "react";
import { Plus, Calculator, Edit, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils/date";
import type { Tax } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

interface TaxForm {
  name: string;
  code: string;
  rate: string;
  description: string;
  appliedByDefault: boolean;
}

const emptyForm: TaxForm = {
  name: "",
  code: "",
  rate: "",
  description: "",
  appliedByDefault: false,
};

export default function TaxesPage() {
  const canWrite = useCan("billing.write");
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<TaxForm>(emptyForm);

  useEffect(() => {
    loadTaxes();
  }, []);

  async function loadTaxes() {
    try {
      const result = await apiClient.taxes.list({ limit: 100 });
      setTaxes(result.data);
    } catch (error) {
      toast.error("Failed to load taxes");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingTax(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEditDialog(tax: Tax) {
    setEditingTax(tax);
    setForm({
      name: tax.name,
      code: tax.code,
      rate: String(tax.rate),
      description: tax.description || "",
      appliedByDefault: tax.appliedByDefault,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name) {
      toast.error("Tax name is required");
      return;
    }
    if (!form.code) {
      toast.error("Tax code is required");
      return;
    }
    const rate = Number(form.rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Rate must be between 0 and 100");
      return;
    }

    setIsSaving(true);
    try {
      if (editingTax) {
        await apiClient.taxes.update(editingTax.id, {
          name: form.name,
          rate,
          description: form.description || undefined,
          appliedByDefault: form.appliedByDefault,
        });
        toast.success("Tax updated");
      } else {
        await apiClient.taxes.create({
          name: form.name,
          code: form.code.toLowerCase().replace(/\s+/g, "_"),
          rate,
          description: form.description || undefined,
          appliedByDefault: form.appliedByDefault,
        });
        toast.success("Tax created");
      }
      setDialogOpen(false);
      loadTaxes();
    } catch (error: any) {
      toast.error(error.message || "Failed to save tax");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tax: Tax) {
    if (confirm(`Are you sure you want to delete tax "${tax.name}"?`)) {
      try {
        await apiClient.taxes.delete(tax.id);
        toast.success("Tax deleted");
        loadTaxes();
      } catch (error) {
        toast.error("Failed to delete tax");
      }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-shimmer rounded" />
        <div className="rounded-md border border-border p-8">
          <div className="animate-shimmer h-96 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Taxes</h1>
          <p className="text-muted-foreground">
            Manage tax rates applied to invoices
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Tax
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Taxes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taxes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Default Taxes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {taxes.filter((t) => t.appliedByDefault).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {taxes.length > 0
                ? (taxes.reduce((sum, t) => sum + t.rate, 0) / taxes.length).toFixed(1)
                : 0}
              %
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {taxes.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <div className="mx-auto mb-4 rounded-full bg-accent p-4 w-fit">
            <Calculator className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No taxes configured</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create tax rates to automatically apply taxes to invoices.
          </p>
          {canWrite && (
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Tax
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Default
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
                {taxes.map((tax) => (
                  <tr
                    key={tax.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium">{tax.name}</p>
                      {tax.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 max-w-[250px] truncate">
                          {tax.description}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono">{tax.code}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold">{tax.rate}%</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant={tax.appliedByDefault ? "success" : "outline"}
                      >
                        {tax.appliedByDefault ? "Yes" : "No"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(tax.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canWrite && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(tax)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(tax)}
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
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTax ? "Edit Tax" : "Create Tax"}
            </DialogTitle>
            <DialogDescription>
              {editingTax
                ? "Update the tax rate details."
                : "Define a new tax rate to apply to invoices."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tax-name">Name</Label>
              <Input
                id="tax-name"
                placeholder="e.g. VAT, Sales Tax, GST"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-code">Code</Label>
              <Input
                id="tax-code"
                placeholder="e.g. vat_18, sales_tax_us"
                value={form.code}
                disabled={!!editingTax}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                  })
                }
              />
              {!editingTax && (
                <p className="text-xs text-muted-foreground">
                  Unique identifier for this tax. Cannot be changed later.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-rate">Rate (%)</Label>
              <Input
                id="tax-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 18"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-desc">Description (optional)</Label>
              <Input
                id="tax-desc"
                placeholder="Brief description of this tax..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="tax-default"
                checked={form.appliedByDefault}
                onCheckedChange={(checked) =>
                  setForm({ ...form, appliedByDefault: checked })
                }
              />
              <div>
                <Label htmlFor="tax-default">Applied by default</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically apply this tax to all invoices unless overridden
                  at the customer, plan, or charge level.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              {editingTax ? "Save Changes" : "Create Tax"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
