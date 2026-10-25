"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Wallet as WalletIcon,
  ArrowUpCircle,
  ArrowDownCircle,
  Trash2,
  X,
} from "lucide-react";
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
import { formatDateTime } from "@/lib/utils/date";
import type { Wallet, WalletTransaction, Customer } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

interface WalletForm {
  customerId: string;
  name: string;
  currency: string;
  rateAmount: string;
  paidCredits: string;
  grantedCredits: string;
  expirationAt: string;
}

const emptyForm: WalletForm = {
  customerId: "",
  name: "",
  currency: "USD",
  rateAmount: "1",
  paidCredits: "",
  grantedCredits: "",
  expirationAt: "",
};

interface TopUpForm {
  paidCredits: string;
  grantedCredits: string;
  voidedCredits: string;
}

const emptyTopUp: TopUpForm = {
  paidCredits: "",
  grantedCredits: "",
  voidedCredits: "",
};

export default function WalletsPage() {
  const canWrite = useCan("billing.write");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create wallet dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<WalletForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  // Top-up dialog
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpWallet, setTopUpWallet] = useState<Wallet | null>(null);
  const [topUpForm, setTopUpForm] = useState<TopUpForm>(emptyTopUp);
  const [isTopping, setIsTopping] = useState(false);

  // Transaction detail
  const [txnWallet, setTxnWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txnOpen, setTxnOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [walletsRes, custRes] = await Promise.all([
        apiClient.wallets.list({ limit: 50 }),
        apiClient.customers.list({ limit: 100 }),
      ]);
      setWallets(walletsRes.data);
      setCustomers(custRes.data);
    } catch (error) {
      toast.error("Failed to load wallets");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.customerId) {
      toast.error("Select a customer");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.wallets.create({
        customerId: form.customerId,
        name: form.name || undefined,
        currency: form.currency,
        rateAmount: Number(form.rateAmount) || 1,
        paidCredits: form.paidCredits ? Number(form.paidCredits) : undefined,
        grantedCredits: form.grantedCredits
          ? Number(form.grantedCredits)
          : undefined,
        expirationAt: form.expirationAt
          ? new Date(form.expirationAt).toISOString()
          : undefined,
      });
      toast.success("Wallet created");
      setCreateOpen(false);
      setForm(emptyForm);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to create wallet");
    } finally {
      setIsSaving(false);
    }
  }

  function openTopUp(wallet: Wallet) {
    setTopUpWallet(wallet);
    setTopUpForm(emptyTopUp);
    setTopUpOpen(true);
  }

  async function handleTopUp() {
    if (!topUpWallet) return;
    const paid = Number(topUpForm.paidCredits) || 0;
    const granted = Number(topUpForm.grantedCredits) || 0;
    const voided = Number(topUpForm.voidedCredits) || 0;
    if (paid === 0 && granted === 0 && voided === 0) {
      toast.error("Enter at least one credit amount");
      return;
    }
    setIsTopping(true);
    try {
      await apiClient.wallets.topUp({
        walletId: topUpWallet.id,
        paidCredits: paid || undefined,
        grantedCredits: granted || undefined,
        voidedCredits: voided || undefined,
      });
      toast.success("Credits updated");
      setTopUpOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to update credits");
    } finally {
      setIsTopping(false);
    }
  }

  async function handleTerminate(wallet: Wallet) {
    if (
      !confirm(
        `Terminate wallet "${wallet.name || wallet.id}"? Remaining credits will be voided.`,
      )
    )
      return;
    try {
      await apiClient.wallets.terminate(wallet.id);
      toast.success("Wallet terminated");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to terminate wallet");
    }
  }

  async function openTransactions(wallet: Wallet) {
    setTxnWallet(wallet);
    setTxnOpen(true);
    try {
      const res = await apiClient.wallets.listTransactions(wallet.id, {
        limit: 50,
      });
      setTransactions(res.data);
    } catch {
      toast.error("Failed to load transactions");
    }
  }

  // Summaries
  const activeWallets = wallets.filter((w) => w.status === "ACTIVE");
  const totalBalance = activeWallets.reduce((s, w) => s + w.balance, 0);
  const totalCredits = activeWallets.reduce((s, w) => s + w.creditsBalance, 0);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wallets</h1>
          <p className="text-muted-foreground">
            Manage prepaid credit wallets for your customers
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Wallet
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Wallets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeWallets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Credits Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalCredits.toLocaleString()} credits
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Monetary Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalBalance, "USD", { showSymbol: true })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {wallets.length === 0 ? (
        <div className="rounded-md border border-border p-12 text-center">
          <div className="mx-auto mb-4 rounded-full bg-accent p-4 w-fit">
            <WalletIcon className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No wallets yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a prepaid credit wallet for a customer to get started.
          </p>
          {canWrite && (
            <Button className="mt-4" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Create Wallet
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
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Rate
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
                {wallets.map((wallet) => (
                  <tr
                    key={wallet.id}
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => openTransactions(wallet)}
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium">
                        {wallet.customer?.name || wallet.customerId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {wallet.customer?.email}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {wallet.name || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono font-bold">
                      {wallet.creditsBalance.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {formatCurrency(wallet.balance, wallet.currency, {
                        showSymbol: true,
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      1 credit = {wallet.rateAmount} {wallet.currency}
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          wallet.status === "ACTIVE" ? "success" : "error"
                        }
                      >
                        {wallet.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {wallet.expirationAt
                        ? formatDateTime(wallet.expirationAt)
                        : "Never"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div
                        className="flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canWrite && wallet.status === "ACTIVE" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openTopUp(wallet)}
                            >
                              <ArrowUpCircle className="mr-1 h-4 w-4" />
                              Top Up
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleTerminate(wallet)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Wallet Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Wallet</DialogTitle>
            <DialogDescription>
              Create a prepaid credit wallet for a customer.
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
                  <SelectValue placeholder="Select customer..." />
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
              <Label>Wallet Name (optional)</Label>
              <Input
                placeholder="e.g. Main Credits"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
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
                    {["USD", "NGN", "KES", "GHS", "ZAR", "UGX", "EUR", "GBP"].map(
                      (c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rate (1 credit =)</Label>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.01"
                  value={form.rateAmount}
                  onChange={(e) =>
                    setForm({ ...form, rateAmount: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Paid Credits</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.paidCredits}
                  onChange={(e) =>
                    setForm({ ...form, paidCredits: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">Purchased credits</p>
              </div>
              <div className="space-y-2">
                <Label>Granted Credits</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.grantedCredits}
                  onChange={(e) =>
                    setForm({ ...form, grantedCredits: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">Free/promotional</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Expiration Date (optional)</Label>
              <Input
                type="datetime-local"
                value={form.expirationAt}
                onChange={(e) =>
                  setForm({ ...form, expirationAt: e.target.value })
                }
              />
              {form.expirationAt && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setForm({ ...form, expirationAt: "" })}
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Create Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Dialog */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Top Up / Void Credits
            </DialogTitle>
            <DialogDescription>
              {topUpWallet?.name || "Wallet"} — Balance:{" "}
              {topUpWallet?.creditsBalance.toLocaleString()} credits (
              {topUpWallet &&
                formatCurrency(topUpWallet.balance, topUpWallet.currency, {
                  showSymbol: true,
                })}
              )
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Paid Credits (purchase)</Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={topUpForm.paidCredits}
                onChange={(e) =>
                  setTopUpForm({ ...topUpForm, paidCredits: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Granted Credits (free)</Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={topUpForm.grantedCredits}
                onChange={(e) =>
                  setTopUpForm({ ...topUpForm, grantedCredits: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Void Credits (remove)</Label>
              <Input
                type="number"
                min="0"
                max={String(topUpWallet?.creditsBalance || 0)}
                placeholder="0"
                value={topUpForm.voidedCredits}
                onChange={(e) =>
                  setTopUpForm({ ...topUpForm, voidedCredits: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTopUp} disabled={isTopping}>
              {isTopping && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transactions Dialog */}
      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Wallet Transactions — {txnWallet?.name || txnWallet?.id}
            </DialogTitle>
            <DialogDescription>
              {txnWallet?.customer?.name} — {txnWallet?.creditsBalance.toLocaleString()} credits remaining
            </DialogDescription>
          </DialogHeader>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No transactions yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      Kind
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                      Credits
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-muted/50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          {txn.transactionType === "INBOUND" ? (
                            <ArrowUpCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-red-600" />
                          )}
                          {txn.transactionType}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            txn.transactionStatus === "GRANTED"
                              ? "success"
                              : txn.transactionStatus === "PURCHASED"
                                ? "secondary"
                                : txn.transactionStatus === "INVOICED"
                                  ? "outline"
                                  : "error"
                          }
                        >
                          {txn.transactionStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {txn.transactionType === "INBOUND" ? "+" : "-"}
                        {Number(txn.creditAmount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {txn.transactionType === "INBOUND" ? "+" : "-"}
                        {formatCurrency(
                          Number(txn.amount),
                          txnWallet?.currency || "USD",
                          { showSymbol: true },
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            txn.status === "SETTLED"
                              ? "success"
                              : txn.status === "FAILED"
                                ? "error"
                                : "outline"
                          }
                        >
                          {txn.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDateTime(txn.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
