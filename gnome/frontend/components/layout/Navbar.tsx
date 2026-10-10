"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Shield, Settings as SettingsIcon, Activity } from "lucide-react";
import { SettingsModal } from "../settings/SettingsModal";
import { CallSessionSummary } from "../../lib/types";

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
                  GNOME
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 font-mono text-zinc-400 border border-zinc-700/60">
                  DEFENSE OPS
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

            {/* Settings Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 font-medium transition-colors"
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
