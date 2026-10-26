"use client";

import { useState } from "react";
import { MoreHorizontal, Edit, Trash2, CreditCard, Banknote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/date";
import type { Customer } from "@/types";

interface CustomerTableProps {
  customers: Customer[];
  /** Omit to hide the action, e.g. when the role cannot edit customers. */
  onEdit?: (customer: Customer) => void;
  onDelete?: (customer: Customer) => void;
  onViewPaymentMethods?: (customer: Customer) => void;
  /** Charge this customer once, or subscribe them to a plan. */
  onCharge?: (customer: Customer) => void;
}

export function CustomerTable({ customers, onEdit, onDelete, onViewPaymentMethods, onCharge }: CustomerTableProps) {
  const hasActions = Boolean(onEdit || onDelete || onViewPaymentMethods || onCharge);
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Spent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Subscriptions
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
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className="hover:bg-muted/50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Avatar name={customer.name} size="sm" />
                    <div className="ml-3">
                      <p className="text-sm font-medium">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">{customer.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge
                    variant={customer.status === "active" ? "success" : "outline"}
                  >
                    {customer.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium">
                    {formatCurrency(customer.totalSpent, customer.currency)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm">{customer.activeSubscriptions}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {formatRelativeTime(customer.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {hasActions && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onCharge && (
                          <DropdownMenuItem onClick={() => onCharge(customer)}>
                            <Banknote className="mr-2 h-4 w-4" />
                            Charge
                          </DropdownMenuItem>
                        )}
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(customer)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onViewPaymentMethods && (
                          <DropdownMenuItem onClick={() => onViewPaymentMethods(customer)}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Payment Methods
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem
                            onClick={() => onDelete(customer)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}