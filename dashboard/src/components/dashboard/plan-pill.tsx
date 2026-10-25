"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTenantPlan } from "@/components/platform/platform-gate";
import type { PlanLimits } from "@/lib/api/platform";

const limitLabels: [keyof Omit<PlanLimits, "disabledFeatures">, string][] = [
  ["customers", "customers"],
  ["activeSubscriptions", "active subscriptions"],
  ["invoicesPerMonth", "invoices a month"],
  ["teamMembers", "team members"],
];

/** The organisation's plan, with its limits on hover and a link to upgrade or manage it. */
export function PlanPill() {
  const plan = useTenantPlan();
  if (!plan) return null;
  const limits = plan.limits
    ? limitLabels.filter(([key]) => plan.limits?.[key] !== undefined).map(([key, label]) => `${plan.limits![key]} ${label}`)
    : [];
  const pill = (
    <span className="hidden sm:inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {plan.name} plan
    </span>
  );
  return (
    <div className="flex items-center gap-2">
      {limits.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>{pill}</TooltipTrigger>
          <TooltipContent>Up to {limits.join(", ")}</TooltipContent>
        </Tooltip>
      ) : (
        pill
      )}
      {plan.manageUrl && (
        <Button asChild size="sm" variant={plan.name === "Free" ? "default" : "outline"}>
          <a href={plan.manageUrl}>
            {plan.name === "Free" && <Sparkles className="h-3.5 w-3.5" aria-hidden />}
            {plan.name === "Free" ? "Upgrade" : "Plan"}
          </a>
        </Button>
      )}
    </div>
  );
}
