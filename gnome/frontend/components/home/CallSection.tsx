"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const PAGE_SIZE = 8; // Two rows of 4 cards on desktop

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
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(calls.length / PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);

  const startIndex = (effectivePage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedCalls = calls.slice(startIndex, endIndex);

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {/* Header pagination controls if multiple pages */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">
              Page <span className="font-mono text-zinc-300 font-semibold">{currentPage}</span> of{" "}
              <span className="font-mono text-zinc-300 font-semibold">{totalPages}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grid of Boxes */}
      {calls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center bg-zinc-950/40">
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedCalls.map((call) => (
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

          {/* Bottom Pagination Controls if multiple pages */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/60 text-xs">
              <span className="text-zinc-500">
                Showing{" "}
                <span className="font-mono font-medium text-zinc-300">
                  {startIndex + 1}–{Math.min(endIndex, calls.length)}
                </span>{" "}
                of <span className="font-mono font-medium text-zinc-300">{calls.length}</span> calls (limit 2 rows / page)
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={effectivePage === 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100 font-medium text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 rounded-lg text-xs font-mono font-medium transition-all hover:scale-105 active:scale-95 ${
                        effectivePage === pageNum
                          ? "bg-emerald-600 text-white font-bold shadow-sm"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={effectivePage === totalPages}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100 font-medium text-xs"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
