"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_UPDATED,
  unreadNotificationCount,
  type AppNotification,
} from "@/lib/notification-center";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    setItems(loadNotifications());
    setUnread(unreadNotificationCount());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(NOTIFICATIONS_UPDATED, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED, refresh);
  }, [refresh]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-full border border-zinc-700/80 bg-zinc-950/50 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-violet-500/30 hover:text-zinc-100"
      >
        Alerts
        {unread > 0 ? (
          <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] text-white">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950/95 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <p className="text-xs font-medium text-zinc-200">Notifications</p>
            <button
              type="button"
              className="text-[10px] text-violet-300"
              onClick={() => {
                markAllNotificationsRead();
                refresh();
              }}
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-xs text-zinc-500">No notifications yet.</li>
            ) : (
              items.slice(0, 20).map((item) => (
                <li key={item.id} className="border-b border-zinc-900/80 last:border-0">
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => {
                        markNotificationRead(item.id);
                        setOpen(false);
                        refresh();
                      }}
                      className={`block px-3 py-2 text-xs ${item.read ? "text-zinc-500" : "text-zinc-200"}`}
                    >
                      <p className="font-medium">{item.title}</p>
                      {item.body ? <p className="mt-0.5 text-zinc-500">{item.body}</p> : null}
                    </Link>
                  ) : (
                    <div className={`px-3 py-2 text-xs ${item.read ? "text-zinc-500" : "text-zinc-200"}`}>
                      <p className="font-medium">{item.title}</p>
                      {item.body ? <p className="mt-0.5 text-zinc-500">{item.body}</p> : null}
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
