"use client";

import { useEffect, useState } from "react";
import { Plus, SlidersHorizontal, Edit, Trash2 } from "lucide-react";
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
import { formatDateTime } from "@/lib/utils/date";
import type { PlanOverride, Customer, Plan } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

interface OverrideForm {
  customerId: string;
  planId: string;
  priceCurrency: string;
  priceAmount: string;
  minimumCommitment: string;
}

const emptyForm: OverrideForm = {
  customerId: "",
  planId: "",
  priceCurrency: "USD",
  priceAmount: "",
  minimumCommitment: "",
};

export default function PlanOverridesPage() {
  const canWrite = useCan("billing.write");
  const [overrides, setOverrides] = useState<PlanOverride[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<PlanOverride | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<OverrideForm>(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [overridesRes, customersRes, plansRes] = await Promise.all([
        apiClient.planOverrides.list({ limit: 100 }),
        apiClient.customers.list({ limit: 100 }),
        apiClient.plans.list(),
      ]);
      setOverrides(overridesRes.data);
      setCustomers(customersRes.data);
      setPlans(plansRes);
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingOverride(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEditDialog(override: PlanOverride) {
    setEditingOverride(override);
    const firstPrice = override.overriddenPrices?.[0];
    setForm({
      customerId: override.customerId,
      planId: override.planId,
      priceCurrency: firstPrice?.currency || "USD",
      priceAmount: firstPrice?.amount != null ? String(firstPrice.amount) : "",
      minimumCommitment: override.overriddenMinimumCommitment != null
        ? String(override.overriddenMinimumCommitment)
        : "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!editingOverride && (!form.customerId || !form.planId)) {
      toast.error("Customer and Plan are required");
      return;
    }

    const overriddenPrices = form.priceAmount
      ? [{ currency: form.priceCurrency, amount: Number(form.priceAmount) }]
      : undefined;
    const overriddenMinimumCommitment = form.minimumCommitment
      ? Number(form.minimumCommitment)
      : undefined;

    setIsSaving(true);
    try {
      if (editingOverride) {
        await apiClient.planOverrides.update(editingOverride.id, {
          overriddenPrices,
          overriddenMinimumCommitment,
        });
        toast.success("Plan override updated");
      } else {
        await apiClient.planOverrides.create({
          customerId: form.customerId,
          planId: form.planId,
          overriddenPrices,
          overriddenMinimumCommitment,
        });
        toast.success("Plan override created");
      }
      setDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save plan override");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(override: PlanOverride) {
    const customerName = override.customer?.name || override.customerId;
    const planName = override.plan?.name || override.planId;
    if (confirm(`Delete override for "${customerName}" on plan "${planName}"?`)) {
      try {
        await apiClient.planOverrides.delete(override.id);
        toast.success("Plan override deleted");
        loadData();
      } catch (error) {
        toast.error("Failed to delete plan override");
      }
    }
  }

  function getCustomerName(id: string) {
    return customers.find((c) => c.id === id)?.name || id;
  }

  function getPlanName(id: string) {
    return plans.find((p) => p.id === id)?.name || id;
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
          <h1 className="text-3xl font-bold">Plan Overrides</h1>
          <p className="text-muted-foreground">
            Customer-specific pricing overrides for plans
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Override
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Overrides
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overrides.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customers with Overrides
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(overrides.map((o) => o.customerId)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Plans with Overrides
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(overrides.map((o) => o.planId)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {overrides.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <div className="mx-auto mb-4 rounded-full bg-accent p-4 w-fit">
            <SlidersHorizontal className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No plan overrides</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create customer-specific pricing to override base plan amounts.
          </p>
          {canWrite && (
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Override
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
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Price Override
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Min. Commitment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Charge Overrides
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
                {overrides.map((override) => (
                  <tr
                    key={override.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium">
                        {override.customer?.name || getCustomerName(override.customerId)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {override.customer?.email || ""}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium">
                        {override.plan?.name || getPlanName(override.planId)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {override.plan?.code || ""}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {override.overriddenPrices && override.overriddenPrices.length > 0 ? (
                        <div className="space-y-0.5">
                          {override.overriddenPrices.map((p, i) => (
                            <Badge key={i} variant="secondary">
                              {p.currency} {p.amount}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {override.overriddenMinimumCommitment != null ? (
                        <Badge variant="secondary">
                          {override.overriddenMinimumCommitment}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {override.overriddenCharges && override.overriddenCharges.length > 0 ? (
                        <Badge variant="secondary">
                          {override.overriddenCharges.length} charge(s)
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(override.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canWrite && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(override)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(override)}
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
              {editingOverride ? "Edit Plan Override" : "Create Plan Override"}
            </DialogTitle>
            <DialogDescription>
              {editingOverride
                ? "Update customer-specific pricing for this plan."
                : "Set custom pricing for a specific customer on a plan."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!editingOverride && (
              <>
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
                          {c.name || c.email} ({c.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select
                    value={form.planId}
                    onValueChange={(v) => setForm({ ...form, planId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Price Override</Label>
              <div className="flex gap-2">
                <Input
                  className="w-24"
                  placeholder="USD"
                  value={form.priceCurrency}
                  onChange={(e) =>
                    setForm({ ...form, priceCurrency: e.target.value.toUpperCase() })
                  }
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount (leave empty for no override)"
                  value={form.priceAmount}
                  onChange={(e) => setForm({ ...form, priceAmount: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Override the base plan price for this customer.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Minimum Commitment Override</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount (leave empty for no override)"
                value={form.minimumCommitment}
                onChange={(e) =>
                  setForm({ ...form, minimumCommitment: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Override the minimum spend commitment for this customer.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              {editingOverride ? "Save Changes" : "Create Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
