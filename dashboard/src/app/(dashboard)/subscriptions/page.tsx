"use client";

import { useEffect, useState } from "react";
import { Plus, MoreHorizontal, ArrowRightLeft } from "lucide-react";
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
import { formatDate, getDaysUntil } from "@/lib/utils/date";
import type { Subscription, Customer, Plan } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

const statusColors = {
  active: "success",
  trial: "default",
  past_due: "warning",
  canceled: "error",
  paused: "outline",
} as const;

export default function SubscriptionsPage() {
  const canWrite = useCan("billing.write");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({
    customerId: "",
    planId: "",
    currency: "USD",
    trialDays: "",
  });

  // Cancel dialog state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [cancelAt, setCancelAt] = useState<"now" | "period_end">("period_end");

  // Change plan dialog state
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [changePlanTarget, setChangePlanTarget] = useState<Subscription | null>(
    null,
  );
  const [newPlanId, setNewPlanId] = useState("");
  const [changePlanPlans, setChangePlanPlans] = useState<Plan[]>([]);

  useEffect(() => {
    loadSubscriptions();
  }, [page, statusFilter]);

  async function loadSubscriptions() {
    try {
      setIsLoading(true);
      const response = await apiClient.subscriptions.list({
        page,
        limit: 10,
        status: statusFilter,
      });
      setSubscriptions(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error("Failed to load subscriptions");
    } finally {
      setIsLoading(false);
    }
  }

  async function openCreateDialog() {
    setForm({ customerId: "", planId: "", currency: "USD", trialDays: "" });
    setCreateOpen(true);
    try {
      const [custRes, planRes] = await Promise.all([
        apiClient.customers.list({ limit: 100 }),
        apiClient.plans.list(),
      ]);
      setCustomers(custRes.data);
      setPlans(planRes.filter((p) => p.isActive));
    } catch {
      toast.error("Failed to load customers or plans");
    }
  }

  async function handleCreate() {
    if (!form.customerId || !form.planId) {
      toast.error("Customer and plan are required");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.subscriptions.create({
        customerId: form.customerId,
        planId: form.planId,
        currency: form.currency,
        trialDays: form.trialDays ? Number(form.trialDays) : undefined,
      });
      toast.success("Subscription created");
      setCreateOpen(false);
      loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to create subscription");
    } finally {
      setIsSaving(false);
    }
  }

  function openCancelDialog(sub: Subscription) {
    setCancelTarget(sub);
    setCancelAt("period_end");
    setCancelOpen(true);
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await apiClient.subscriptions.cancel(cancelTarget.id, cancelAt);
      toast.success(
        cancelAt === "now"
          ? "Subscription canceled"
          : "Subscription scheduled for cancellation",
      );
      setCancelOpen(false);
      loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel subscription");
    }
  }

  async function handlePause(sub: Subscription) {
    try {
      await apiClient.subscriptions.pause(sub.id);
      toast.success("Subscription paused");
      loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to pause subscription");
    }
  }

  async function handleResume(sub: Subscription) {
    try {
      await apiClient.subscriptions.resume(sub.id);
      toast.success("Subscription resumed");
      loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to resume subscription");
    }
  }

  async function openChangePlanDialog(sub: Subscription) {
    setChangePlanTarget(sub);
    setNewPlanId("");
    setChangePlanOpen(true);
    try {
      const allPlans = await apiClient.plans.list();
      // Filter out the current plan
      setChangePlanPlans(
        allPlans.filter((p) => p.isActive && p.id !== sub.planId),
      );
    } catch {
      toast.error("Failed to load plans");
    }
  }

  async function handleChangePlan() {
    if (!changePlanTarget || !newPlanId) {
      toast.error("Please select a new plan");
      return;
    }
    try {
      await apiClient.subscriptions.changePlan(changePlanTarget.id, newPlanId);
      toast.success("Plan changed successfully");
      setChangePlanOpen(false);
      loadSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to change plan");
    }
  }

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Subscriptions</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Manage customer subscriptions</p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Subscription
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-md border border-border p-8">
          <div className="animate-shimmer h-96 rounded" />
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <p className="text-muted-foreground">No subscriptions found</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Customer
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Next Billing
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Current Period
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {subscriptions.map((subscription) => {
                    const daysUntilBilling = getDaysUntil(
                      subscription.nextBillingDate,
                    );

                    return (
                      <tr
                        key={subscription.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="text-sm font-medium">
                              {subscription.customerName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {subscription.customerEmail}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="text-sm font-medium">
                              {subscription.planName}
                            </p>
                            <Badge variant="secondary" className="mt-1">
                              {subscription.planInterval}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Badge
                            variant={statusColors[subscription.status] as any}
                          >
                            {subscription.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-sm font-medium">
                            {formatCurrency(
                              subscription.amount,
                              subscription.currency,
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="text-sm">
                              {formatDate(subscription.nextBillingDate)}
                            </p>
                            {daysUntilBilling <= 7 && daysUntilBilling > 0 && (
                              <p className="text-xs text-amber-600">
                                in {daysUntilBilling} days
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-sm text-muted-foreground">
                            {formatDate(subscription.currentPeriodStart)} -{" "}
                            {formatDate(subscription.currentPeriodEnd)}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canWrite && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {subscription.status === "active" && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        openChangePlanDialog(subscription)
                                      }
                                    >
                                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                                      Change Plan
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handlePause(subscription)}
                                    >
                                      Pause
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        openCancelDialog(subscription)
                                      }
                                      className="text-red-600"
                                    >
                                      Cancel
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {subscription.status === "paused" && (
                                  <DropdownMenuItem
                                    onClick={() => handleResume(subscription)}
                                  >
                                    Resume
                                  </DropdownMenuItem>
                                )}
                                {subscription.status === "trial" && (
                                  <DropdownMenuItem
                                    onClick={() => openCancelDialog(subscription)}
                                  >
                                    Cancel
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
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
                {total} subscriptions
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

      {/* Create Subscription Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Subscription</DialogTitle>
            <DialogDescription>
              Subscribe a customer to a billing plan.
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
                      {p.name} ({p.interval})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "USD",
                      "NGN",
                      "KES",
                      "GHS",
                      "ZAR",
                      "UGX",
                      "EUR",
                      "GBP",
                    ].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trial Days</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.trialDays}
                  onChange={(e) =>
                    setForm({ ...form, trialDays: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Create Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Choose when to cancel {cancelTarget?.customerName}&apos;s
              subscription to {cancelTarget?.planName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Cancel At</Label>
              <Select
                value={cancelAt}
                onValueChange={(v) => setCancelAt(v as "now" | "period_end")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="period_end">
                    End of current period
                  </SelectItem>
                  <SelectItem value="now">Immediately</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cancelAt === "now" && (
              <p className="text-sm text-amber-600">
                The subscription will be canceled immediately. The customer will
                lose access right away.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep Active
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>
              Switch {changePlanTarget?.customerName}&apos;s subscription from{" "}
              <strong>{changePlanTarget?.planName}</strong> to a different plan.
              A new billing period will start immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>New Plan</Label>
              <Select value={newPlanId} onValueChange={setNewPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {changePlanPlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.interval})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newPlanId && (
              <p className="text-sm text-muted-foreground">
                The subscription will be switched immediately and a new billing
                cycle will begin.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePlan} disabled={!newPlanId}>
              Change Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
