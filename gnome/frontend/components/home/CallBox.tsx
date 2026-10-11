"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Radio, Clock, Calendar, User, PhoneCall, ShieldAlert, Check, Globe, Copy } from "lucide-react";
import { CallSessionSummary } from "../../lib/types";
import { useCallDuration } from "../../hooks/useCallDuration";
import { formatDuration, formatCallDateTime, formatRegionWithCountry } from "../../lib/utils";
import { useNotification } from "../notifications/NotificationProvider";

interface CallBoxProps {
  call: CallSessionSummary;
  onTerminate?: (id: string) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const CallBox: React.FC<CallBoxProps> = ({
  call,
  onTerminate,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const { notify } = useNotification();
  const [copied, setCopied] = useState(false);
  const elapsedSeconds = useCallDuration(
    call.started_at,
    call.status,
    call.duration_seconds,
    call.ended_at
  );

  const isActive = call.status === "active";

  const handleBoxClick = (e: React.MouseEvent) => {
    if (isSelectionMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(call.id);
    }
  };

  return (
    <div
      onClick={handleBoxClick}
      className={`group relative flex flex-col justify-between rounded-xl border p-5 transition-all duration-200 ${
        isSelectionMode ? "cursor-pointer select-none" : ""
      } ${
        isSelected
          ? "border-emerald-400 bg-emerald-950/20 ring-2 ring-emerald-500/50 shadow-lg"
          : isActive
          ? "border-emerald-500/40 bg-zinc-900/90 shadow-lg shadow-emerald-950/20 hover:border-emerald-500/70"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80"
      }`}
    >
      {/* Top Bar: Status Indicator + Truncated Session ID (left) & End Call Action (right) */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 min-w-0">
          {isSelectionMode ? (
            <div
              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                isSelected
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-zinc-950 border-zinc-700 text-transparent hover:border-zinc-500"
              }`}
            >
              <Check className="w-3.5 h-3.5" />
            </div>
          ) : null}

          {/* Status Indicator (LIVE / Ended) before the Call ID */}
          {isActive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50 shrink-0">
              Ended
            </span>
          )}

          {/* Truncated Session ID with full ID hover & click-to-copy */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigator.clipboard.writeText(call.id);
              setCopied(true);
              notify.success(
                "Copied to Clipboard",
                `Session ID #${call.id} copied.`
              );
              setTimeout(() => setCopied(false), 1500);
            }}
            className="group/copy inline-flex items-center gap-1 text-xs font-mono text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors cursor-pointer px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800/80 truncate"
            title={copied ? "Copied ID to clipboard!" : `Click to copy ID: ${call.id}`}
          >
            <span>{copied ? "Copied!" : `#${call.id.slice(0, 8)}`}</span>
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-3 h-3 text-zinc-500 group-hover/copy:text-zinc-300 opacity-60 group-hover/copy:opacity-100 transition-opacity shrink-0" />
            )}
          </button>
        </div>

        {/* Right-aligned Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isActive && onTerminate && !isSelectionMode && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTerminate(call.id);
              }}
              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 px-2 py-0.5 rounded transition-all hover:scale-105 active:scale-95"
              title="Terminate this call immediately"
            >
              End Call
            </button>
          )}
        </div>
      </div>

      {/* Main Box Details */}
      <div className="my-4 space-y-3">
        {/* Scammer Number & Region */}
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-0.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            Scammer&apos;s Number
          </div>
          <div className="text-base font-bold text-zinc-100 font-mono">
            {call.scammer_number}
          </div>
          {/* Region moved under scammer number with Globe icon */}
          <div
            className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono mt-1.5 cursor-help"
            title={formatRegionWithCountry(call)}
          >
            <Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="truncate">Region: {formatRegionWithCountry(call)}</span>
          </div>
        </div>

        {/* Assigned Gnome & Twilio Virtual Number */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/40">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1 mb-0.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              Gnome Assigned
            </div>
            <div
              className="text-sm font-semibold text-emerald-300 truncate cursor-help"
              title={call.gnome_name}
            >
              {call.gnome_name}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1 mb-0.5">
              <PhoneCall className="w-3.5 h-3.5 text-blue-400" />
              Gnome&apos;s Number
            </div>
            <div className="text-sm font-bold font-mono text-zinc-300 truncate">
              {call.gnome_number}
            </div>
          </div>
        </div>

        {/* Timestamps & Duration */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/40 text-xs">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-400" />
              Time Elapsed
            </div>
            <div className={`font-mono font-medium ${isActive ? "text-emerald-400" : "text-zinc-300"}`}>
              {formatDuration(elapsedSeconds)}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-400" />
              Date and Time
            </div>
            <div
              className="font-mono text-zinc-400 truncate text-[11px]"
              title={formatCallDateTime(call.started_at)}
            >
              {formatCallDateTime(call.started_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Navigation Link or Selection Action */}
      {isSelectionMode ? (
        isActive ? (
          <div
            className="w-full text-center py-2 px-3 rounded-lg text-xs font-mono text-zinc-500 bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-center gap-1.5 cursor-not-allowed select-none"
            title="Active calls cannot be deleted. The call must be ended first."
          >
            <span>Active (Cannot Delete)</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleSelect) onToggleSelect(call.id);
            }}
            className={`w-full text-center py-2 px-3 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 ${
              isSelected
                ? "bg-emerald-600 text-white font-semibold"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            {isSelected ? "Selected" : "Select Call"}
          </button>
        )
      ) : (
        <Link
          href={`/calls/${call.id}`}
          className={`w-full text-center py-2 px-3 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 ${
            isActive
              ? "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          {isActive ? "Manage Live Call" : "View Session Details"}
        </Link>
      )}
    </div>
  );
};
