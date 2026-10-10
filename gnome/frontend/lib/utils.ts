import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours === 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${hours}h ${remainingMins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatStartTime(dateInput: string | Date): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return String(dateInput);
  }
}

export function formatCallDateTime(dateInput: string | Date): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const dateStr = d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr} @ ${timeStr}`;
  } catch {
    return String(dateInput);
  }
}

