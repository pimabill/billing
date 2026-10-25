"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  X,
  Clock,
  AlertCircle,
  CheckCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { moneyApi } from "@/lib/api/money";
import { apiClient } from "@/lib/api/client";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open && !loaded) {
      loadNotifications();
    }
  }, [open, loaded]);

  async function loadNotifications() {
    try {
      const activities = await apiClient.activity.list(15);
      const mapped: Notification[] = activities.map((a) => {
        let type: Notification["type"] = "info";
        let title = "Event";

        if (a.type.includes("succeeded") || a.type.includes("paid")) {
          type = "success";
          title = a.type.includes("payment")
            ? "Payment Received"
            : "Invoice Paid";
        } else if (a.type.includes("failed")) {
          type = "error";
          title = a.type.includes("payment")
            ? "Payment Failed"
            : "Invoice Failed";
        } else if (a.type.includes("subscription")) {
          type = "info";
          title = "Subscription Created";
        } else if (a.type.includes("invoice.created")) {
          type = "info";
          title = "Invoice Created";
        }

        return {
          id: a.id,
          type,
          title,
          message: a.description,
          timestamp: new Date(a.createdAt),
          read: false,
        };
      });

      // Managed payments: a status change in the last 30 days is news.
      const managed = await moneyApi.managedStatus().catch(() => null);
      const account = managed?.account;
      if (account?.statusChangedAt && Date.now() - new Date(account.statusChangedAt).getTime() < 30 * 86_400_000 && account.status !== "pending_review") {
        const managedNotice: Record<string, { type: Notification["type"]; title: string; message: string }> = {
          active: { type: "success", title: "Managed payments approved", message: "Payments can now go through managed payments." },
          rejected: { type: "error", title: "Managed payments not approved", message: account.reason ?? "See the managed payments page." },
          suspended: { type: "warning", title: "Managed payments paused", message: account.reason ?? "See the managed payments page." },
        };
        const notice = managedNotice[account.status];
        if (notice) mapped.push({ id: `managed_${account.statusChangedAt}`, ...notice, timestamp: new Date(account.statusChangedAt), read: false });
      }
      mapped.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Mark older ones as read (only first 3 are "unread")
      mapped.forEach((n, i) => {
        if (i >= 3) n.read = true;
      });

      setNotifications(mapped);
      setLoaded(true);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "success":
        return (
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
        );
      case "warning":
        return (
          <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-500" />
        );
      case "error":
        return (
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
        );
      default:
        return <Info className="h-4 w-4 text-blue-600 dark:text-blue-500" />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white border-0 text-xs">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-foreground">Notifications</h3>
            <p className="text-sm text-muted-foreground">
              You have {unreadCount} unread notification
              {unreadCount !== 1 ? "s" : ""}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Bell className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-muted/50 transition-colors ${
                    !notification.read ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 mt-1">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground">
                          {notification.title}
                        </h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => removeNotification(notification.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(notification.timestamp, {
                            addSuffix: true,
                          })}
                        </div>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Mark as read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="p-3 border-t border-border">
            <Button variant="ghost" className="w-full text-sm" size="sm">
              View all notifications
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
