"use client";

import React from "react";
import { CallSessionSummary } from "../../lib/types";
import { CallBox } from "./CallBox";

interface CallSectionProps {
  title: string;
  description?: string;
  badgeCount: number;
  badgeVariant?: "emerald" | "zinc";
  calls: CallSessionSummary[];
  emptyMessage?: string;
  onTerminateCall?: (id: string) => void;
  isSelectionMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

export const CallSection: React.FC<CallSectionProps> = ({
  title,
  description,
  badgeCount,
  badgeVariant = "zinc",
  calls,
  emptyMessage = "No calls found.",
  onTerminateCall,
  isSelectionMode = false,
  selectedIds = [],
  onToggleSelect,
}) => {
  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            {title}
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold ${
                badgeVariant === "emerald"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700/60"
              }`}
            >
              {badgeCount}
            </span>
          </h2>
          {description && (
            <span className="hidden md:inline text-xs text-zinc-500">
              {description}
            </span>
          )}
        </div>
      </div>

      {/* Grid of Boxes */}
      {calls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center bg-zinc-950/40">
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {calls.map((call) => (
            <CallBox
              key={call.id}
              call={call}
              onTerminate={onTerminateCall}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.includes(call.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
};
