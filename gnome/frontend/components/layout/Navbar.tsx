"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Shield, Settings as SettingsIcon, Activity } from "lucide-react";
import { SettingsModal } from "../settings/SettingsModal";
import { CallSessionSummary } from "../../lib/types";
import { checkBackendHealth } from "../../lib/api";

interface NavbarProps {
  activeCount?: number;
  onAddDebugCall?: (call: CallSessionSummary) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeCount: propActiveCount,
  onAddDebugCall,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [localActiveCount, setLocalActiveCount] = useState<number>(0);
  const [backendStatus, setBackendStatus] = useState<"ready" | "unreachable">("unreachable");

  useEffect(() => {
    let isMounted = true;
    const verifyHealth = async () => {
      try {
        const isHealthy = await checkBackendHealth();
        if (isMounted) {
          setBackendStatus(isHealthy ? "ready" : "unreachable");
        }
      } catch {
        if (isMounted) {
          setBackendStatus("unreachable");
        }
      }
    };
    verifyHealth();
    const interval = setInterval(verifyHealth, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const updateCount = () => {
      if (typeof window !== "undefined") {
        try {
          const stored = JSON.parse(
            window.localStorage.getItem("gnome_debug_calls") || "[]"
          );
          const active = stored.filter(
            (c: CallSessionSummary) => c.status === "active"
          ).length;
          setLocalActiveCount(active);
        } catch {}
      }
    };
    updateCount();
    window.addEventListener("gnome_calls_updated", updateCount);
    window.addEventListener("storage", updateCount);
    return () => {
      window.removeEventListener("gnome_calls_updated", updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, []);

  const activeCount =
    propActiveCount !== undefined ? propActiveCount : localActiveCount;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-zinc-100 tracking-tight">
                  Scams Gnome More
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 font-mono text-zinc-400 border border-zinc-700/60">
                  v0.1.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-none">
                AI Counter-Scam Call Interception Console
              </p>
            </div>
          </Link>

          {/* Right Action Items */}
          <div className="flex items-center gap-3">
            {/* Live Calls Counter Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-zinc-400">Active Gnomes:</span>
              <span className="font-mono font-bold text-emerald-400">
                {activeCount}
              </span>
            </div>

            {/* Backend Health Status (Between Active Gnomes and Settings) */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border text-xs transition-colors ${
                backendStatus === "ready"
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-red-500/30 text-red-400"
              }`}
              title={
                backendStatus === "ready"
                  ? "Backend server is healthy and responding"
                  : "Backend server is offline or unreachable"
              }
            >
              <span className="relative flex h-2 w-2">
                {backendStatus === "ready" ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                )}
              </span>
              <span className="text-zinc-400">Backend:</span>
              <span className="font-semibold font-mono">
                {backendStatus === "ready" ? "Ready" : "Unreachable"}
              </span>
            </div>

            {/* Settings Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 font-medium transition-all hover:scale-105 active:scale-95"
              title="Open Settings"
            >
              <SettingsIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Pop-up Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onAddDebugCall={onAddDebugCall}
      />
    </>
  );
};
