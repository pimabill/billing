"use client";

import { useEffect, useState } from "react";
import { Plus, Tag, Edit, Trash2, X, UserPlus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import type { Coupon, Customer } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

interface CouponForm {
  code: string;
  name: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: string;
  currency: string;
  maxRedemptions: string;
  expiresAt: string;
}

const emptyForm: CouponForm = {
  code: "",
  name: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  currency: "USD",
  maxRedemptions: "",
  expiresAt: "",
};

export default function CouponsPage() {
  const canWrite = useCan("billing.write");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<CouponForm>(emptyForm);

  // Apply coupon dialog state
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyingCoupon, setApplyingCoupon] = useState<Coupon | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    loadCoupons();
  }, []);

  async function loadCoupons() {
    try {
      const result = await apiClient.coupons.list({ limit: 50 });
      setCoupons(result.data);
    } catch (error) {
      toast.error("Failed to load coupons");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingCoupon(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEditDialog(coupon: Coupon) {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description || "",
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      currency: coupon.currency || "USD",
      maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : "",
      expiresAt: coupon.expiresAt
        ? new Date(coupon.expiresAt).toISOString().slice(0, 16)
        : "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name) {
      toast.error("Coupon name is required");
      return;
    }
    if (!form.code) {
      toast.error("Coupon code is required");
      return;
    }
    if (!form.discountValue || Number(form.discountValue) <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }
    if (
      form.discountType === "PERCENTAGE" &&
      Number(form.discountValue) > 100
    ) {
      toast.error("Percentage discount cannot exceed 100%");
      return;
    }

    setIsSaving(true);
    try {
      if (editingCoupon) {
        await apiClient.coupons.update(editingCoupon.id, {
          name: form.name,
          description: form.description || undefined,
          expiresAt: form.expiresAt
            ? new Date(form.expiresAt).toISOString()
            : undefined,
        });
        toast.success("Coupon updated");
      } else {
        const payload: Parameters<typeof apiClient.coupons.create>[0] = {
          code: form.code.toUpperCase().replace(/\s+/g, "_"),
          name: form.name,
          description: form.description || undefined,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          maxRedemptions: form.maxRedemptions
            ? Number(form.maxRedemptions)
            : undefined,
          expiresAt: form.expiresAt
            ? new Date(form.expiresAt).toISOString()
            : undefined,
        };
        if (form.discountType === "FIXED_AMOUNT") {
          payload.currency = form.currency;
        }
        await apiClient.coupons.create(payload);
        toast.success("Coupon created");
      }
      setDialogOpen(false);
      loadCoupons();
    } catch (error: any) {
      toast.error(error.message || "Failed to save coupon");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(coupon: Coupon) {
    try {
      await apiClient.coupons.update(coupon.id, {
        isActive: !coupon.isActive,
      });
      toast.success(`Coupon ${coupon.isActive ? "deactivated" : "activated"}`);
      loadCoupons();
    } catch (error) {
      toast.error("Failed to update coupon");
    }
  }

  async function handleDelete(coupon: Coupon) {
    if (confirm(`Are you sure you want to delete coupon "${coupon.code}"?`)) {
      try {
        await apiClient.coupons.delete(coupon.id);
        toast.success("Coupon deleted successfully");
        loadCoupons();
      } catch (error) {
        toast.error("Failed to delete coupon");
      }
    }
  }

  async function openApplyDialog(coupon: Coupon) {
    setApplyingCoupon(coupon);
    setSelectedCustomerId("");
    setApplyOpen(true);
    try {
      const result = await apiClient.customers.list({ limit: 100 });
      setCustomers(result.data);
    } catch {
      toast.error("Failed to load customers");
    }
  }

  async function handleApplyCoupon() {
    if (!applyingCoupon || !selectedCustomerId) {
      toast.error("Please select a customer");
      return;
    }
    setIsApplying(true);
    try {
      await apiClient.coupons.apply({
        couponId: applyingCoupon.id,
        customerId: selectedCustomerId,
      });
      toast.success("Coupon applied to customer");
      setApplyOpen(false);
      loadCoupons();
    } catch (error: any) {
      toast.error(error.message || "Failed to apply coupon");
    } finally {
      setIsApplying(false);
    }
  }

  function formatDiscount(coupon: Coupon): string {
    if (coupon.discountType === "PERCENTAGE") {
      return `${coupon.discountValue}%`;
    }
    return formatCurrency(coupon.discountValue, coupon.currency || "USD", {
      showSymbol: true,
    });
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
          <h1 className="text-3xl font-bold">Coupons</h1>
          <p className="text-muted-foreground">
            Manage discount coupons for your customers
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Coupon
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Coupons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coupons.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Coupons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {coupons.filter((c) => c.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Redemptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {coupons.reduce((sum, c) => sum + c.redemptionCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {coupons.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <div className="mx-auto mb-4 rounded-full bg-accent p-4 w-fit">
            <Tag className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No coupons yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first coupon to offer discounts to your customers.
          </p>
          {canWrite && (
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Coupon
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
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Discount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Redemptions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {coupons.map((coupon) => {
                  const isExpired =
                    coupon.expiresAt && new Date(coupon.expiresAt) < new Date();

                  return (
                    <tr
                      key={coupon.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-mono font-medium">
                            {coupon.code}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium">{coupon.name}</p>
                        {coupon.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                            {coupon.description}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold">
                          {formatDiscount(coupon)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            coupon.discountType === "PERCENTAGE"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {coupon.discountType === "PERCENTAGE"
                            ? "Percentage"
                            : "Fixed Amount"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm">
                          {coupon.redemptionCount}
                          {coupon.maxRedemptions
                            ? ` / ${coupon.maxRedemptions}`
                            : ""}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {canWrite && (
                            <Switch
                              checked={coupon.isActive}
                              onCheckedChange={() => handleToggleActive(coupon)}
                            />
                          )}
                          <Badge
                            variant={
                              isExpired
                                ? "error"
                                : coupon.isActive
                                  ? "success"
                                  : "outline"
                            }
                          >
                            {isExpired
                              ? "Expired"
                              : coupon.isActive
                                ? "Active"
                                : "Inactive"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {coupon.expiresAt
                          ? formatDateTime(coupon.expiresAt)
                          : "Never"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canWrite && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Apply to customer"
                              onClick={() => openApplyDialog(coupon)}
                              disabled={!coupon.isActive}
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(coupon)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(coupon)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCoupon ? "Edit Coupon" : "Create Coupon"}
            </DialogTitle>
            <DialogDescription>
              {editingCoupon
                ? "Update the coupon details below."
                : "Fill in the details to create a new discount coupon."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Code</Label>
              <Input
                id="coupon-code"
                placeholder="e.g. SUMMER25"
                value={form.code}
                disabled={!!editingCoupon}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.target.value.toUpperCase().replace(/\s+/g, "_"),
                  })
                }
              />
              {!editingCoupon && (
                <p className="text-xs text-muted-foreground">
                  Unique code customers will enter at checkout.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon-name">Name</Label>
              <Input
                id="coupon-name"
                placeholder="e.g. Summer Sale 25% Off"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon-desc">Description (optional)</Label>
              <Input
                id="coupon-desc"
                placeholder="Brief description of the coupon..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>

            {!editingCoupon && (
              <>
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <Select
                    value={form.discountType}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        discountType: v as CouponForm["discountType"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                      <SelectItem value="FIXED_AMOUNT">
                        Fixed Amount
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  className={
                    form.discountType === "FIXED_AMOUNT"
                      ? "grid grid-cols-2 gap-4"
                      : ""
                  }
                >
                  <div className="space-y-2">
                    <Label htmlFor="coupon-value">
                      Discount Value
                      {form.discountType === "PERCENTAGE" ? " (%)" : ""}
                    </Label>
                    <Input
                      id="coupon-value"
                      type="number"
                      min="0"
                      max={form.discountType === "PERCENTAGE" ? "100" : undefined}
                      step={form.discountType === "PERCENTAGE" ? "1" : "0.01"}
                      placeholder={
                        form.discountType === "PERCENTAGE" ? "e.g. 25" : "e.g. 10.00"
                      }
                      value={form.discountValue}
                      onChange={(e) =>
                        setForm({ ...form, discountValue: e.target.value })
                      }
                    />
                  </div>

                  {form.discountType === "FIXED_AMOUNT" && (
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select
                        value={form.currency}
                        onValueChange={(v) =>
                          setForm({ ...form, currency: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "UGX",
                            "TZS", "RWF", "XOF", "XAF", "EGP", "MAD", "INR", "BRL",
                            "CAD", "AUD", "JPY", "CNY",
                          ].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="coupon-max">Max Redemptions (optional)</Label>
              <Input
                id="coupon-max"
                type="number"
                min="0"
                placeholder="Leave empty for unlimited"
                value={form.maxRedemptions}
                disabled={!!editingCoupon}
                onChange={(e) =>
                  setForm({ ...form, maxRedemptions: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon-expires">Expiration Date (optional)</Label>
              <Input
                id="coupon-expires"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm({ ...form, expiresAt: e.target.value })
                }
              />
              {form.expiresAt && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setForm({ ...form, expiresAt: "" })}
                >
                  <X className="h-3 w-3" />
                  Clear expiration
                </button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              {editingCoupon ? "Save Changes" : "Create Coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Coupon Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Coupon</DialogTitle>
            <DialogDescription>
              Apply <span className="font-mono font-semibold">{applyingCoupon?.code}</span> ({applyingCoupon && formatDiscount(applyingCoupon)} off) to a customer.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={selectedCustomerId}
                onValueChange={setSelectedCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer..." />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyCoupon} disabled={isApplying || !selectedCustomerId}>
              {isApplying && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Apply Coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
