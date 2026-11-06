"use client";

import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, X, Activity } from "lucide-react";
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
import type { BillableMetric } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { BrandMark } from "@/components/brand-mark";

const AGGREGATION_TYPES = [
  { value: "COUNT", label: "Count", description: "Number of events" },
  { value: "SUM", label: "Sum", description: "Sum of field values" },
  { value: "MAX", label: "Max", description: "Maximum field value" },
  { value: "UNIQUE_COUNT", label: "Unique Count", description: "Count of unique field values" },
  { value: "LATEST", label: "Latest", description: "Most recent field value" },
  { value: "WEIGHTED_SUM", label: "Weighted Sum", description: "Weighted sum of field values" },
];

const NEEDS_FIELD = ["SUM", "MAX", "UNIQUE_COUNT", "LATEST", "WEIGHTED_SUM"];

interface MetricForm {
  name: string;
  code: string;
  description: string;
  aggregationType: string;
  fieldName: string;
  recurring: boolean;
  filters: { key: string; values: string }[];
}

const emptyForm: MetricForm = {
  name: "",
  code: "",
  description: "",
  aggregationType: "COUNT",
  fieldName: "",
  recurring: false,
  filters: [],
};

export default function BillableMetricsPage() {
  const canWrite = useCan("billing.write");
  const [metrics, setMetrics] = useState<BillableMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<BillableMetric | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<MetricForm>(emptyForm);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    try {
      setIsLoading(true);
      const data = await apiClient.billableMetrics.list();
      setMetrics(data);
    } catch (error: any) {
      toast.error("Failed to load billable metrics");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreate() {
    setEditingMetric(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(metric: BillableMetric) {
    setEditingMetric(metric);
    setForm({
      name: metric.name,
      code: metric.code,
      description: metric.description || "",
      aggregationType: metric.aggregationType,
      fieldName: metric.fieldName || "",
      recurring: metric.recurring,
      filters: (metric.filters || []).map((f) => ({
        key: f.key,
        values: f.values.join(", "),
      })),
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.code || !form.aggregationType) {
      toast.error("Name, code, and aggregation type are required");
      return;
    }

    if (NEEDS_FIELD.includes(form.aggregationType) && !form.fieldName) {
      toast.error(`Field name is required for ${form.aggregationType} aggregation`);
      return;
    }

    setIsSaving(true);
    try {
      const filters = form.filters
        .filter((f) => f.key && f.values)
        .map((f) => ({
          key: f.key,
          values: f.values.split(",").map((v) => v.trim()).filter(Boolean),
        }));

      if (editingMetric) {
        await apiClient.billableMetrics.update(editingMetric.id, {
          name: form.name,
          description: form.description || undefined,
          fieldName: form.fieldName || undefined,
          recurring: form.recurring,
          filters: filters.length > 0 ? filters : undefined,
        });
        toast.success("Billable metric updated");
      } else {
        await apiClient.billableMetrics.create({
          name: form.name,
          code: form.code,
          description: form.description || undefined,
          aggregationType: form.aggregationType,
          fieldName: form.fieldName || undefined,
          recurring: form.recurring,
          filters: filters.length > 0 ? filters : undefined,
        });
        toast.success("Billable metric created");
      }
      setDialogOpen(false);
      loadMetrics();
    } catch (error: any) {
      toast.error(error.message || "Failed to save metric");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(metric: BillableMetric) {
    if (!confirm(`Delete metric "${metric.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.billableMetrics.delete(metric.id);
      toast.success("Billable metric deleted");
      loadMetrics();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete metric");
    }
  }

  function addFilter() {
    setForm((f) => ({ ...f, filters: [...f.filters, { key: "", values: "" }] }));
  }

  function removeFilter(index: number) {
    setForm((f) => ({
      ...f,
      filters: f.filters.filter((_, i) => i !== index),
    }));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <BrandMark animated tight className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Billable Metrics</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Define usage-based metrics for event tracking and aggregation.
          </p>
          {!canWrite && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Metric
          </Button>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{metric.name}</CardTitle>
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {metric.code}
                  </code>
                </div>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(metric)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(metric)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {metric.description && (
                <p className="text-sm text-muted-foreground">{metric.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{metric.aggregationType}</Badge>
                {metric.fieldName && (
                  <Badge variant="outline">Field: {metric.fieldName}</Badge>
                )}
                {metric.recurring && <Badge variant="default">Recurring</Badge>}
              </div>
              {metric.filters && metric.filters.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Filters:</span>
                  {metric.filters.map((f) => (
                    <div key={f.id} className="text-xs">
                      <span className="font-medium">{f.key}:</span>{" "}
                      {f.values.join(", ")}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {metric._count?.charges ?? 0} charge{(metric._count?.charges ?? 0) !== 1 ? "s" : ""} using this metric
              </div>
            </CardContent>
          </Card>
        ))}

        {metrics.length === 0 && (
          <Card className="border-dashed col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No billable metrics yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first metric to start tracking usage events.
              </p>
              {canWrite && (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Metric
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingMetric ? "Edit Billable Metric" : "Create Billable Metric"}
            </DialogTitle>
            <DialogDescription>
              {editingMetric
                ? "Update the metric configuration."
                : "Define a new metric for usage-based billing."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="API Calls"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  placeholder="api_calls"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={!!editingMetric}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Number of API calls made"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Aggregation Type</Label>
              <Select
                value={form.aggregationType}
                onValueChange={(v) => setForm({ ...form, aggregationType: v })}
                disabled={!!editingMetric}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex flex-col">
                        <span>{t.label}</span>
                        <span className="text-xs text-muted-foreground">{t.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {NEEDS_FIELD.includes(form.aggregationType) && (
              <div className="space-y-2">
                <Label>Field Name</Label>
                <Input
                  placeholder="tokens"
                  value={form.fieldName}
                  onChange={(e) => setForm({ ...form, fieldName: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  The property key in event data to aggregate
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="recurring"
                checked={form.recurring}
                onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="recurring" className="text-sm font-normal">
                Recurring (value carries forward across billing periods)
              </Label>
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Filters</Label>
                <Button variant="ghost" size="sm" onClick={addFilter}>
                  <Plus className="h-3 w-3 mr-1" /> Add Filter
                </Button>
              </div>
              {form.filters.map((filter, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Input
                    placeholder="Key (e.g., region)"
                    value={filter.key}
                    onChange={(e) => {
                      const filters = [...form.filters];
                      filters[index] = { ...filters[index], key: e.target.value };
                      setForm({ ...form, filters });
                    }}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Values (comma-separated)"
                    value={filter.values}
                    onChange={(e) => {
                      const filters = [...form.filters];
                      filters[index] = { ...filters[index], values: e.target.value };
                      setForm({ ...form, filters });
                    }}
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeFilter(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="h-4 w-4 mr-2" />}
              {editingMetric ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
