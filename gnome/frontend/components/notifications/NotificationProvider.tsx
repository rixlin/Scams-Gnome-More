"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  CheckCircle2,
  PhoneOff,
  AlertTriangle,
  Info,
  Trash2,
  X,
} from "lucide-react";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  isExiting?: boolean;
}

interface NotificationContextType {
  notify: {
    success: (title: string, message?: string, duration?: number) => void;
    error: (title: string, message?: string, duration?: number) => void;
    warning: (title: string, message?: string, duration?: number) => void;
    info: (title: string, message?: string, duration?: number) => void;
  };
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotification(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}

// Global dispatcher helper for non-React contexts or external handlers
export function emitNotification(type: NotificationType, title: string, message?: string, duration?: number) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("gnome_notification", {
        detail: { type, title, message, duration },
      })
    );
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const dismiss = useCallback((id: string) => {
    // Set isExiting to trigger smooth exit animation before removing
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isExiting: true } : n))
    );
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 200);
  }, []);

  const addNotification = useCallback(
    (type: NotificationType, title: string, message?: string, duration = 4500) => {
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newNotif: NotificationItem = {
        id,
        type,
        title,
        message,
        duration,
        isExiting: false,
      };

      setNotifications((prev) => [newNotif, ...prev.slice(0, 4)]); // Keep at most 5 notifications

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  // Listen for custom window notifications
  useEffect(() => {
    const handleCustomNotif = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.type && detail.title) {
        addNotification(detail.type, detail.title, detail.message, detail.duration);
      }
    };

    window.addEventListener("gnome_notification", handleCustomNotif);
    return () => {
      window.removeEventListener("gnome_notification", handleCustomNotif);
    };
  }, [addNotification]);

  const notify = {
    success: (title: string, message?: string, duration?: number) =>
      addNotification("success", title, message, duration),
    error: (title: string, message?: string, duration?: number) =>
      addNotification("error", title, message, duration),
    warning: (title: string, message?: string, duration?: number) =>
      addNotification("warning", title, message, duration),
    info: (title: string, message?: string, duration?: number) =>
      addNotification("info", title, message, duration),
  };

  const getIcon = (type: NotificationType, title: string) => {
    if (type === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (type === "error") {
      if (title.toLowerCase().includes("terminate") || title.toLowerCase().includes("disconnected")) {
        return <PhoneOff className="w-4 h-4 text-red-400 shrink-0" />;
      }
      return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
    }
    if (type === "warning") return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    if (title.toLowerCase().includes("delete") || title.toLowerCase().includes("purg")) {
      return <Trash2 className="w-4 h-4 text-blue-400 shrink-0" />;
    }
    return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
  };

  const getBorderAndBg = (type: NotificationType) => {
    switch (type) {
      case "success":
        return "border-emerald-500/35 bg-zinc-950/90 shadow-emerald-950/30";
      case "error":
        return "border-red-500/40 bg-zinc-950/90 shadow-red-950/30";
      case "warning":
        return "border-amber-500/40 bg-zinc-950/90 shadow-amber-950/30";
      case "info":
        return "border-blue-500/35 bg-zinc-950/90 shadow-blue-950/30";
    }
  };

  return (
    <NotificationContext.Provider value={{ notify, dismiss }}>
      {children}

      {/* Global Notification Container: Below header bar (top-20), right corner */}
      <div
        className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`pointer-events-auto rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 transition-all ${getBorderAndBg(
              notif.type
            )} ${
              notif.isExiting
                ? "animate-notification-exit"
                : "animate-notification-enter"
            }`}
          >
            <div className="mt-0.5">{getIcon(notif.type, notif.title)}</div>

            <div className="flex-1 min-w-0 pr-1">
              <h4 className="text-xs font-bold text-zinc-100 tracking-tight">
                {notif.title}
              </h4>
              {notif.message && (
                <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed break-words">
                  {notif.message}
                </p>
              )}
            </div>

            <button
              onClick={() => dismiss(notif.id)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-all hover:scale-110 active:scale-95 shrink-0 -mt-1 -mr-1"
              title="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

