"use client";

import { useEffect, useState } from "react";
import { Plus, Check, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils/currency";
import type { Plan } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "UGX",
  "TZS", "RWF", "XOF", "XAF", "EGP", "MAD", "INR", "BRL",
  "CAD", "AUD", "JPY", "CNY",
];

interface PlanForm {
  name: string;
  code: string;
  description: string;
  interval: "hourly" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  billingTiming: "IN_ADVANCE" | "IN_ARREARS";
  features: string[];
  prices: { id?: string; currency: string; amount: string }[];
  netPaymentTerms: string;
  invoiceGracePeriodDays: string;
  progressiveBillingThreshold: string;
}

const emptyForm: PlanForm = {
  name: "",
  code: "",
  description: "",
  interval: "monthly",
  billingTiming: "IN_ARREARS",
  features: [],
  prices: [{ currency: "USD", amount: "" }],
  netPaymentTerms: "",
  invoiceGracePeriodDays: "",
  progressiveBillingThreshold: "",
};

export default function PlansPage() {
  const canWrite = useCan("billing.write");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [newFeature, setNewFeature] = useState("");

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      const data = await apiClient.plans.list();
      setPlans(data);
      // Auto-select first available currency from plans
      if (!selectedCurrency || selectedCurrency === "") {
        const currencies = new Set<string>();
        data.forEach((plan) =>
          plan.prices.forEach((p) => currencies.add(p.currency)),
        );
        const sorted = Array.from(currencies).sort();
        if (sorted.length > 0) setSelectedCurrency(sorted[0]);
        else setSelectedCurrency("USD");
      }
    } catch (error) {
      toast.error("Failed to load plans");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingPlan(null);
    setForm({
      ...emptyForm,
      features: [],
      prices: [{ currency: "USD", amount: "" }],
    });
    setNewFeature("");
    setDialogOpen(true);
  }

  function openEditDialog(plan: Plan) {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      code: plan.code,
      description: plan.description,
      interval: plan.interval,
      billingTiming: plan.billingTiming || "IN_ARREARS",
      features: [...plan.features],
      prices: plan.prices.map((p) => ({
        id: p.id,
        currency: p.currency,
        amount: String(p.amount),
      })),
      netPaymentTerms: plan.netPaymentTerms != null ? String(plan.netPaymentTerms) : "",
      invoiceGracePeriodDays: plan.invoiceGracePeriodDays != null ? String(plan.invoiceGracePeriodDays) : "",
      progressiveBillingThreshold: plan.progressiveBillingThreshold != null ? String(plan.progressiveBillingThreshold) : "",
    });
    setNewFeature("");
    setDialogOpen(true);
  }

  function addFeature() {
    const trimmed = newFeature.trim();
    if (trimmed && !form.features.includes(trimmed)) {
      setForm({ ...form, features: [...form.features, trimmed] });
      setNewFeature("");
    }
  }

  function removeFeature(index: number) {
    setForm({ ...form, features: form.features.filter((_, i) => i !== index) });
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
    value: string,
  ) {
    const prices = [...form.prices];
    prices[index] = { ...prices[index], [field]: value };
    setForm({ ...form, prices });
  }

  async function handleSubmit() {
    if (!form.name) {
      toast.error("Plan name is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editingPlan) {
        await apiClient.plans.update(editingPlan.id, {
          name: form.name,
          description: form.description,
          features: form.features,
          billingTiming: form.billingTiming,
          ...(form.netPaymentTerms ? { netPaymentTerms: Number(form.netPaymentTerms) } : {}),
          ...(form.invoiceGracePeriodDays ? { invoiceGracePeriodDays: Number(form.invoiceGracePeriodDays) } : {}),
          ...(form.progressiveBillingThreshold ? { progressiveBillingThreshold: Number(form.progressiveBillingThreshold) } : {}),
        });

        // Sync prices: update existing, add new, delete removed
        const originalPrices = editingPlan.prices;
        const formPrices = form.prices.filter((p) => p.currency && p.amount);

        // Delete removed prices
        for (const op of originalPrices) {
          if (op.id && !formPrices.some((fp) => fp.id === op.id)) {
            await apiClient.plans.deletePrice(editingPlan.id, op.id);
          }
        }

        // Update existing or add new prices
        for (const fp of formPrices) {
          if (fp.id) {
            const original = originalPrices.find((op) => op.id === fp.id);
            if (original && Number(fp.amount) !== original.amount) {
              await apiClient.plans.updatePrice(editingPlan.id, fp.id, Number(fp.amount));
            }
          } else {
            await apiClient.plans.addPrice(editingPlan.id, {
              currency: fp.currency,
              amount: Number(fp.amount),
            });
          }
        }

        toast.success("Plan updated");
      } else {
        if (!form.code) {
          toast.error("Plan code is required");
          setIsSaving(false);
          return;
        }
        const validPrices = form.prices.filter((p) => p.currency && p.amount);
        await apiClient.plans.create({
          name: form.name,
          code: form.code,
          description: form.description,
          interval: form.interval,
          billingTiming: form.billingTiming,
          features: form.features,
          prices: validPrices.map((p) => ({
            currency: p.currency,
            amount: Number(p.amount),
          })),
          ...(form.netPaymentTerms ? { netPaymentTerms: Number(form.netPaymentTerms) } : {}),
          ...(form.invoiceGracePeriodDays ? { invoiceGracePeriodDays: Number(form.invoiceGracePeriodDays) } : {}),
          ...(form.progressiveBillingThreshold ? { progressiveBillingThreshold: Number(form.progressiveBillingThreshold) } : {}),
        });
        toast.success("Plan created");
      }
      setDialogOpen(false);
      loadPlans();
    } catch (error: any) {
      toast.error(error.message || "Failed to save plan");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(plan: Plan) {
    try {
      await apiClient.plans.update(plan.id, {
        isActive: !plan.isActive,
      });
      toast.success(`Plan ${plan.isActive ? "deactivated" : "activated"}`);
      loadPlans();
    } catch (error) {
      toast.error("Failed to update plan");
    }
  }

  async function handleDelete(plan: Plan) {
    if (confirm(`Are you sure you want to delete ${plan.name} plan?`)) {
      try {
        await apiClient.plans.delete(plan.id);
        toast.success("Plan deleted successfully");
        loadPlans();
      } catch (error) {
        toast.error("Failed to delete plan");
      }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-shimmer rounded" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 animate-shimmer rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plans</h1>
          <p className="text-muted-foreground">
            Manage your subscription plans
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Plan
          </Button>
        )}
      </div>

      {/* Currency Selector */}
      <div className="flex flex-wrap gap-2">
        {(() => {
          const usedCurrencies = new Set<string>();
          plans.forEach((plan) =>
            plan.prices.forEach((p) => usedCurrencies.add(p.currency)),
          );
          const currencies = usedCurrencies.size > 0
            ? Array.from(usedCurrencies).sort()
            : ["USD"];
          return currencies.map((currency) => (
            <Button
              key={currency}
              variant={selectedCurrency === currency ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCurrency(currency)}
            >
              {currency}
            </Button>
          ));
        })()}
      </div>

      {/* Plans Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Create Plan Card */}
        {canWrite && (
          <Card
            className="border-dashed border-2 hover:border-primary transition-colors cursor-pointer"
            onClick={openCreateDialog}
          >
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[400px] p-6">
              <div className="rounded-full bg-accent p-4">
                <Plus className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Create New Plan</h3>
              <p className="mt-2 text-sm text-muted-foreground text-center">
                Add a new subscription plan for your customers
              </p>
            </CardContent>
          </Card>
        )}

        {/* Plan Cards */}
        {plans.map((plan) => {
          const price = plan.prices.find(
            (p) => p.currency === selectedCurrency,
          );

          return (
            <Card key={plan.id} className="relative overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {plan.description}
                    </CardDescription>
                  </div>
                  <Badge variant={plan.isActive ? "success" : "outline"}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Price */}
                <div>
                  {price ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tabular-nums">
                        {formatCurrency(price.amount, price.currency, { showSymbol: true })}
                      </span>
                      <span className="text-muted-foreground">/{plan.interval === "yearly" ? "year" : plan.interval === "monthly" ? "month" : plan.interval}</span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-semibold text-muted-foreground">Not priced in {selectedCurrency}</p>
                      <p className="text-sm text-muted-foreground">Priced in {plan.prices.map((p) => p.currency).join(", ") || "no currency yet"}</p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">
                      {plan.interval}
                    </Badge>
                    <Badge variant={plan.billingTiming === "IN_ADVANCE" ? "default" : "outline"}>
                      {plan.billingTiming === "IN_ADVANCE" ? "Pay in Advance" : "Pay in Arrears"}
                    </Badge>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2 pt-4 border-t border-border">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {canWrite && (
                      <Switch
                        checked={plan.isActive}
                        onCheckedChange={() => handleToggleActive(plan)}
                      />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {plan.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(plan)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(plan)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? "Edit Plan" : "Create Plan"}
            </DialogTitle>
            <DialogDescription>
              {editingPlan
                ? "Update the plan details below."
                : "Fill in the details to create a new billing plan."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Name</Label>
              <Input
                id="plan-name"
                placeholder="e.g. Premium Monthly"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            {!editingPlan && (
              <div className="space-y-2">
                <Label htmlFor="plan-code">Code</Label>
                <Input
                  id="plan-code"
                  placeholder="e.g. premium_monthly"
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
            <div className="space-y-2">
              <Label htmlFor="plan-desc">Description</Label>
              <Textarea
                id="plan-desc"
                placeholder="Plan description..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            {!editingPlan && (
              <div className="space-y-2">
                <Label>Billing Interval</Label>
                <Select
                  value={form.interval}
                  onValueChange={(v) =>
                    setForm({ ...form, interval: v as PlanForm["interval"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Billing Timing</Label>
              <Select
                value={form.billingTiming}
                onValueChange={(v) =>
                  setForm({ ...form, billingTiming: v as PlanForm["billingTiming"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_ARREARS">Pay in Arrears (after period)</SelectItem>
                  <SelectItem value="IN_ADVANCE">Pay in Advance (before period)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                When customers are charged for this plan
              </p>
            </div>

            {/* Advanced Billing */}
            <div className="space-y-2">
              <Label>Net Payment Terms (days)</Label>
              <Input
                type="number"
                placeholder="e.g. 30 (leave empty for org default)"
                value={form.netPaymentTerms}
                onChange={(e) => setForm({ ...form, netPaymentTerms: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Days after invoice before payment is due
              </p>
            </div>
            <div className="space-y-2">
              <Label>Invoice Grace Period (days)</Label>
              <Input
                type="number"
                placeholder="e.g. 3 (0 = finalize immediately)"
                value={form.invoiceGracePeriodDays}
                onChange={(e) => setForm({ ...form, invoiceGracePeriodDays: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Days an invoice stays in DRAFT before auto-finalizing
              </p>
            </div>
            <div className="space-y-2">
              <Label>Progressive Billing Threshold</Label>
              <Input
                type="number"
                placeholder="e.g. 1000 (leave empty to disable)"
                value={form.progressiveBillingThreshold}
                onChange={(e) => setForm({ ...form, progressiveBillingThreshold: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Usage cost threshold that triggers a mid-cycle invoice
              </p>
            </div>

            {/* Features */}
            <div className="space-y-2">
              <Label>Features</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a feature..."
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFeature();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addFeature}>
                  Add
                </Button>
              </div>
              {form.features.length > 0 && (
                <div className="space-y-1 pt-2">
                  {form.features.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-1.5 bg-muted rounded text-sm"
                    >
                      <span>{f}</span>
                      <button
                        type="button"
                        onClick={() => removeFeature(i)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prices */}
            <div className="space-y-2">
              <Label>Prices</Label>
              {form.prices.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select
                    value={p.currency}
                    onValueChange={(v) => updatePrice(i, "currency", v)}
                    disabled={!!editingPlan && !!editingPlan.prices[i]?.id}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((c) => (
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
              {editingPlan ? "Save Changes" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
