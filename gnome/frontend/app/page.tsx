"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CallSessionSummary } from "../lib/types";
import { fetchCallSessions, terminateCall, deleteCall } from "../lib/api";
import { CallSection } from "../components/home/CallSection";
import { Navbar } from "../components/layout/Navbar";
import {
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckSquare,
  Square,
  Trash2,
  X,
  Search,
  MapPin,
  User,
  Calendar,
  Filter,
  ChevronDown,
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
        const terminated = JSON.parse(
          window.localStorage.getItem("gnome_terminated_calls") || "{}"
        );
        if (Object.keys(terminated).length > 0) {
          setBackendCalls((prev) =>
            prev.map((c) =>
              terminated[c.id]
                ? {
                    ...c,
                    status: "ended" as const,
                    ended_at: terminated[c.id].ended_at || c.ended_at,
                    duration_seconds:
                      terminated[c.id].duration_seconds || c.duration_seconds,
                  }
                : c
            )
          );
        }
      } catch {}
    }
  }, []);

  // Initial load, storage sync, and periodic polling
  useEffect(() => {
    let active = true;

    // Immediately sync debug and terminated calls
    syncDebugCalls();

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

  // Filter state
  const [searchNumber, setSearchNumber] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [selectedGnome, setSelectedGnome] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");

  const hasActiveFilters =
    searchNumber.trim() !== "" ||
    selectedRegion !== "all" ||
    selectedGnome !== "all" ||
    selectedDate !== "";

  const handleResetFilters = () => {
    setSearchNumber("");
    setSelectedRegion("all");
    setSelectedGnome("all");
    setSelectedDate("");
  };

  // Distinct regions and gnomes for filter dropdowns
  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    allCalls.forEach((c) => {
      if (c.region && c.region.trim()) {
        regions.add(c.region.trim());
      }
    });
    return Array.from(regions).sort((a, b) => a.localeCompare(b));
  }, [allCalls]);

  const availableGnomes = useMemo(() => {
    const gnomes = new Set<string>();
    allCalls.forEach((c) => {
      if (c.gnome_name && c.gnome_name.trim()) {
        gnomes.add(c.gnome_name.trim());
      }
    });
    return Array.from(gnomes).sort((a, b) => a.localeCompare(b));
  }, [allCalls]);

  const matchesNumber = (call: CallSessionSummary, term: string) => {
    if (!term.trim()) return true;
    const q = term.trim().toLowerCase();
    const qDigits = term.replace(/\D/g, "");
    const scammer = (call.scammer_number || "").toLowerCase();
    const scammerDigits = (call.scammer_number || "").replace(/\D/g, "");
    const gnomeNum = (call.gnome_number || "").toLowerCase();
    const gnomeNumDigits = (call.gnome_number || "").replace(/\D/g, "");

    if (scammer.includes(q) || gnomeNum.includes(q)) return true;
    if (
      qDigits.length > 0 &&
      (scammerDigits.includes(qDigits) || gnomeNumDigits.includes(qDigits))
    ) {
      return true;
    }
    return false;
  };

  const matchesDate = (dateIso: string, targetDateStr: string) => {
    if (!targetDateStr) return true;
    try {
      const d = new Date(dateIso);
      if (isNaN(d.getTime())) return false;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}` === targetDateStr;
    } catch {
      return false;
    }
  };

  const filteredCalls = useMemo(() => {
    return allCalls.filter((call) => {
      if (!matchesNumber(call, searchNumber)) return false;
      if (
        selectedRegion !== "all" &&
        (call.region || "").trim().toLowerCase() !== selectedRegion.toLowerCase()
      ) {
        return false;
      }
      if (
        selectedGnome !== "all" &&
        (call.gnome_name || "").trim().toLowerCase() !== selectedGnome.toLowerCase()
      ) {
        return false;
      }
      if (selectedDate && !matchesDate(call.started_at, selectedDate)) {
        return false;
      }
      return true;
    });
  }, [allCalls, searchNumber, selectedRegion, selectedGnome, selectedDate]);

  const activeCalls = filteredCalls.filter((c) => c.status === "active");
  const endedCalls = filteredCalls.filter((c) => c.status === "ended");
  const totalBurrowActiveCount = allCalls.filter((c) => c.status === "active").length;

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
    const selectableIds = filteredCalls.map((c) => c.id);
    const allFilteredSelected =
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIds.includes(id));
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...selectableIds])));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    setIsDeleting(true);

    // Filter out debug calls immediately
    const remainingDebug = debugCalls.filter((c) => !selectedIds.includes(c.id));
    setDebugCalls(remainingDebug);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("gnome_debug_calls", JSON.stringify(remainingDebug));
      try {
        const storedDetails = JSON.parse(
          window.localStorage.getItem("gnome_debug_call_details") || "{}"
        );
        for (const id of selectedIds) {
          delete storedDetails[id];
        }
        window.localStorage.setItem(
          "gnome_debug_call_details",
          JSON.stringify(storedDetails)
        );
      } catch {}
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
    setShowDeleteConfirm(false);
    await loadCalls(true);
  };

  return (
    <div className="min-h-screen bg-canvas text-zinc-100 flex flex-col font-sans">
      <Navbar
        activeCount={totalBurrowActiveCount}
        onAddDebugCall={handleAddDebugCall}
      />

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-zinc-800">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2.5">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  {selectedIds.length === filteredCalls.length && filteredCalls.length > 0 ? (
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
                  className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
                  title="Cancel selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSelectionMode(true)}
                disabled={filteredCalls.length === 0}
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
                Backend unavailable: Ensure your backend is running, or check your server settings in Settings ({error}).
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

        {/* Search & Filter Toolbar */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
              <Filter className="w-4 h-4 text-emerald-400" />
              <span>Search &amp; Filter Calls</span>
            </div>
            {hasActiveFilters && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-400">
                  Showing {filteredCalls.length} of {allCalls.length} calls
                </span>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  <X className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Numbers Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchNumber}
                onChange={(e) => setSearchNumber(e.target.value)}
                placeholder="Search phone numbers..."
                className="w-full pl-8.5 pr-8 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/80 transition-colors font-mono"
              />
              {searchNumber && (
                <button
                  type="button"
                  onClick={() => setSearchNumber("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
                  title="Clear number search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 2. Region Dropdown */}
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full pl-8.5 pr-8 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500/80 transition-colors appearance-none cursor-pointer"
              >
                <option value="all">All Regions</option>
                {availableRegions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>

            {/* 3. Gnome Dropdown */}
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <select
                value={selectedGnome}
                onChange={(e) => setSelectedGnome(e.target.value)}
                className="w-full pl-8.5 pr-8 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500/80 transition-colors appearance-none cursor-pointer"
              >
                <option value="all">All Gnomes</option>
                {availableGnomes.map((gnome) => (
                  <option key={gnome} value={gnome}>
                    {gnome}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>

            {/* 4. Date Picker */}
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-8.5 pr-8 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500/80 transition-colors cursor-pointer"
                title="Filter by call start date"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
                  title="Clear date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section A: Active Calls */}
        <CallSection
          title="Active Calls"
          description="Calls currently connected with a gnome"
          badgeCount={activeCalls.length}
          badgeVariant="emerald"
          calls={activeCalls}
          emptyMessage={
            hasActiveFilters
              ? "No active calls match your search and filter criteria."
              : "No active calls currently connected. Forwarded scam calls will appear here automatically."
          }
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
          emptyMessage={
            hasActiveFilters
              ? "No ended calls match your search and filter criteria."
              : "No ended calls recorded yet."
          }
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
        />

        {/* Delete Confirmation Modal (Consistent with Call Termination Dialog) */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-zinc-900 border border-red-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-zinc-100">
                  Delete Selected Call{selectedIds.length > 1 ? "s" : ""}?
                </h3>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Are you sure you want to permanently delete {selectedIds.length} call session
                {selectedIds.length > 1 ? "s" : ""}? This will purge transcripts and session records from the burrow.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteSelected}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : `Yes, Delete (${selectedIds.length})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
