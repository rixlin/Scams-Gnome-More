"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CallSessionSummary } from "../lib/types";
import { fetchCallSessions, terminateCall, deleteCall } from "../lib/api";
import { CallSection } from "../components/home/CallSection";
import { Navbar } from "../components/layout/Navbar";
import {
  RefreshCw,
  AlertCircle,
  CheckSquare,
  Square,
  Trash2,
  X,
} from "lucide-react";

export default function HomePage() {
  const [backendCalls, setBackendCalls] = useState<CallSessionSummary[]>([]);
  const [debugCalls, setDebugCalls] = useState<CallSessionSummary[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("gnome_debug_calls");
        if (stored) return JSON.parse(stored);
      } catch {
        // Fallback
      }
    }
    return [];
  });

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCalls = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const data = await fetchCallSessions();
      setBackendCalls(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load calls.";
      if (!isSilent) setError(msg);
    } finally {
      if (!isSilent) setRefreshing(false);
    }
  }, []);

  const syncDebugCalls = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("gnome_debug_calls");
        if (stored) {
          setDebugCalls(JSON.parse(stored));
        }
      } catch {}
    }
  }, []);

  // Initial load, storage sync, and periodic polling
  useEffect(() => {
    let active = true;

    async function initialFetch() {
      try {
        const data = await fetchCallSessions();
        if (active) {
          setBackendCalls(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load calls.");
        }
      }
    }

    initialFetch();

    const interval = setInterval(async () => {
      syncDebugCalls();
      try {
        const data = await fetchCallSessions();
        if (active) {
          setBackendCalls(data);
          setError(null);
        }
      } catch {
        // Silent poll error
      }
    }, 3000);

    const handleSync = () => syncDebugCalls();
    window.addEventListener("gnome_calls_updated", handleSync);
    window.addEventListener("focus", handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("gnome_calls_updated", handleSync);
      window.removeEventListener("focus", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [syncDebugCalls]);

  // Merge debug calls and backend calls, avoiding duplicates
  const allCalls: CallSessionSummary[] = [
    ...debugCalls,
    ...backendCalls.filter((c) => !debugCalls.some((d) => d.id === c.id)),
  ];

  const activeCalls = allCalls.filter((c) => c.status === "active");
  const endedCalls = allCalls.filter((c) => c.status === "ended");

  // Add debug call from Settings modal
  const handleAddDebugCall = (newCall: CallSessionSummary) => {
    setDebugCalls((prev) => {
      const updated = [newCall, ...prev.filter((c) => c.id !== newCall.id)];
      if (typeof window !== "undefined") {
        window.localStorage.setItem("gnome_debug_calls", JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Terminate a single call
  const handleTerminate = async (callId: string) => {
    // If it's a debug call, update its status locally
    const isDebug = debugCalls.some((c) => c.id === callId);
    if (isDebug) {
      await terminateCall(callId, "operator_dashboard_terminate");
      setDebugCalls((prev) => {
        const updated = prev.map((c) =>
          c.id === callId ? { ...c, status: "ended" as const, ended_at: new Date().toISOString() } : c
        );
        if (typeof window !== "undefined") {
          window.localStorage.setItem("gnome_debug_calls", JSON.stringify(updated));
        }
        return updated;
      });
      return;
    }

    try {
      await terminateCall(callId, "operator_dashboard_terminate");
      await loadCalls(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to terminate call.");
    }
  };

  // Selection toggle handlers
  const handleToggleSelect = (callId: string) => {
    setSelectedIds((prev) =>
      prev.includes(callId) ? prev.filter((id) => id !== callId) : [...prev, callId]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === allCalls.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allCalls.map((c) => c.id));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    const confirmMsg = `Delete ${selectedIds.length} selected call session${
      selectedIds.length > 1 ? "s" : ""
    }?`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);

    // Filter out debug calls immediately
    const remainingDebug = debugCalls.filter((c) => !selectedIds.includes(c.id));
    setDebugCalls(remainingDebug);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("gnome_debug_calls", JSON.stringify(remainingDebug));
    }

    // Attempt backend delete for non-debug calls
    const backendIdsToDelete = selectedIds.filter(
      (id) => !debugCalls.some((d) => d.id === id)
    );

    if (backendIdsToDelete.length > 0) {
      await Promise.allSettled(
        backendIdsToDelete.map((id) => deleteCall(id).catch(() => null))
      );
    }

    // Refresh and exit selection mode
    setSelectedIds([]);
    setIsSelectionMode(false);
    setIsDeleting(false);
    await loadCalls(true);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans">
      <Navbar
        activeCount={activeCalls.length}
        onAddDebugCall={handleAddDebugCall}
      />

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-zinc-900">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <span>Interception Burrow</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Live monitoring for gnomes intercepting scam callers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Selection Toolbar */}
            {isSelectionMode ? (
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 animate-in fade-in">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  {selectedIds.length === allCalls.length && allCalls.length > 0 ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>Deselect All</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Select All</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.length === 0 || isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isDeleting
                      ? "Deleting..."
                      : `Delete Selected (${selectedIds.length})`}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds([]);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                  title="Cancel selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSelectionMode(true)}
                disabled={allCalls.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 font-medium transition-colors disabled:opacity-40"
                title="Select calls to delete"
              >
                <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />
                <span>Select</span>
              </button>
            )}

            <button
              onClick={() => loadCalls(false)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors disabled:opacity-50"
              title="Refresh calls"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Backend connection notice: {error}. Check backend server settings in Settings.
              </span>
            </div>
            <button
              onClick={() => loadCalls(false)}
              className="text-xs underline hover:text-amber-200"
            >
              Retry
            </button>
          </div>
        )}

        {/* Section A: Active Calls */}
        <CallSection
          title="Active Calls"
          description="Calls currently connected to a gnome"
          badgeCount={activeCalls.length}
          badgeVariant="emerald"
          calls={activeCalls}
          emptyMessage="No active calls currently connected. Forwarded scam calls will appear here automatically."
          onTerminateCall={handleTerminate}
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
        />

        {/* Section B: Ended Calls */}
        <CallSection
          title="Ended Calls"
          description="Completed call sessions and previous interceptions"
          badgeCount={endedCalls.length}
          badgeVariant="zinc"
          calls={endedCalls}
          emptyMessage="No ended calls recorded yet."
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
        />
      </main>
    </div>
  );
}
