"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Bell } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { doctorRefs, type DoctorNotification } from "./refs";
import { ago } from "./ui";

function isUnread(n: DoctorNotification) {
  return !n.readAt && n.status !== "read";
}

/**
 * The doctor's bell: referral updates (contacted, booked, seen…), care team changes and shared
 * reports. A referral update opens that referral right here; a new one that arrives while the
 * portal is open shows as a toast.
 */
export function DoctorNotifications({ onOpenReferral }: { onOpenReferral: (referralId: string) => void }) {
  const [open, setOpen] = useState(false);
  const notifications = useQuery(doctorRefs.notifications, { limit: 10, includeRead: true });
  const unread = useQuery(doctorRefs.unreadCount, {}) ?? 0;
  const markRead = useMutation(doctorRefs.markRead);
  const markAllRead = useMutation(doctorRefs.markAllRead);

  const openOne = (n: DoctorNotification) => {
    if (isUnread(n)) markRead({ notificationId: n._id }).catch(() => undefined);
    const referralId = n.payload?.data?.referralId;
    setOpen(false);
    if (referralId) onOpenReferral(referralId);
  };

  // Toast only for notifications that arrive after the page loaded
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    const latest = notifications[0];
    if (lastSeen.current === null) {
      lastSeen.current = latest._id;
      return;
    }
    if (latest._id === lastSeen.current) return;
    lastSeen.current = latest._id;
    if (!isUnread(latest)) return;
    playSound("receive");
    const referralId = latest.payload?.data?.referralId;
    toast(latest.payload?.title ?? "New update", {
      description: latest.payload?.body,
      action: referralId ? { label: "Open", onClick: () => openOne(latest) } : undefined,
    });
    // openOne is stable enough for a toast action; re-running on it would re-toast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-pt-surface text-pt-ink shadow-pt transition hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-95 dark:shadow-none"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-pt-primary px-1 text-center text-[10px] font-semibold leading-[18px] text-pt-on-primary ring-2 ring-pt-canvas">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-pt-line bg-pt-surface p-0 shadow-pt-lift">
        <div className="flex items-center justify-between border-b border-pt-line px-4 py-3">
          <p className="text-sm font-semibold text-pt-ink">Updates</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead({}).catch(() => toast.error("Couldn't mark them as read"))}
              className="text-xs font-medium text-pt-muted hover:text-pt-ink"
            >
              Mark all as read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {notifications === undefined ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-pt-sunken" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-pt-muted">No updates yet. They appear here as your patients move through care.</p>
          ) : (
            <ul className="divide-y divide-pt-line">
              {notifications.map((n) => (
                <li key={n._id}>
                  <button type="button" onClick={() => openOne(n)} className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-pt-hover">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", isUnread(n) ? "bg-pt-accent" : "bg-transparent")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm text-pt-ink", isUnread(n) && "font-semibold")}>{n.payload?.title ?? "Update"}</span>
                      {n.payload?.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-pt-muted">{n.payload.body}</span>}
                      <span className="mt-1 block text-xs text-pt-faint">{ago(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
