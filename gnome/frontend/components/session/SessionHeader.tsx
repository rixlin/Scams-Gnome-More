"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  PhoneOff,
  User,
  PhoneCall,
  Clock,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { CallSessionDetail } from "../../lib/types";
import { useCallDuration } from "../../hooks/useCallDuration";
import { formatDuration } from "../../lib/utils";

interface SessionHeaderProps {
  call: CallSessionDetail;
  onTerminate: (reason?: string) => Promise<void>;
  isTerminating?: boolean;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  call,
  onTerminate,
  isTerminating = false,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const elapsed = useCallDuration(
    call.started_at,
    call.status,
    call.duration_seconds,
    call.ended_at
  );
  const isActive = call.status === "active";

  const handleConfirmTerminate = async () => {
    setShowConfirm(false);
    await onTerminate("operator_manual_kill");
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Top Bar: Back link, status, and Terminate button */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="Back to Home Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-zinc-100 font-mono">
                Session #{call.id.slice(0, 8)}
              </h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  INTERCEPTING LIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  Ended
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Region: <span className="text-zinc-200">{call.region || "Unknown"}</span>
            </p>
          </div>
        </div>

        {/* Timer & Termination */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
            <Clock className="w-4 h-4 text-zinc-400" />
            <span className="text-zinc-400">Elapsed:</span>
            <span className={`font-mono font-bold ${isActive ? "text-emerald-400" : "text-zinc-300"}`}>
              {formatDuration(elapsed)}
            </span>
          </div>

          {isActive && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isTerminating}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              {isTerminating ? "Terminating..." : "Terminate Call"}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
          <div className="w-full max-w-md bg-zinc-900 border border-red-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-zinc-100">Terminate Active Call?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to hang up the phone line immediately? This will disconnect the scammer from the Gnome backend.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTerminate}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
              >
                Yes, Terminate Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-1">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Scammer&apos;s Number
          </div>
          <div className="text-sm font-bold text-zinc-100 font-mono">
            {call.scammer_number}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-1">
            <PhoneCall className="w-3.5 h-3.5 text-blue-400" />
            Gnome&apos;s Number
          </div>
          <div className="text-sm font-bold text-blue-300 font-mono">
            {call.gnome_number}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-1">
            <User className="w-3.5 h-3.5 text-emerald-400" />
            Assigned Gnome
          </div>
          <div className="text-sm font-bold text-emerald-300 truncate">
            {call.gnome?.name || "Assigned Gnome"}
          </div>
        </div>
      </div>
    </div>
  );
};

