"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  PhoneOff,
  User,
  PhoneCall,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Calendar,
  Globe,
  Trash2,
} from "lucide-react";
import { CallSessionDetail } from "../../lib/types";
import { useCallDuration } from "../../hooks/useCallDuration";
import { formatDuration, formatCallDateTime, formatRegionWithCountry } from "../../lib/utils";
import { useNotification } from "../notifications/NotificationProvider";
import { deleteCall } from "../../lib/api";

interface SessionHeaderProps {
  call: CallSessionDetail;
  onTerminate: (reason?: string) => Promise<void>;
  isTerminating?: boolean;
  onDelete?: () => Promise<void>;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  call,
  onTerminate,
  isTerminating = false,
  onDelete,
}) => {
  const router = useRouter();
  const { notify } = useNotification();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isClosingConfirm, setIsClosingConfirm] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isClosingDeleteConfirm, setIsClosingDeleteConfirm] = useState(false);
  const [isDeletingCall, setIsDeletingCall] = useState(false);

  const elapsed = useCallDuration(
    call.started_at,
    call.status,
    call.duration_seconds,
    call.ended_at
  );
  const isActive = call.status === "active";

  const handleCloseConfirm = () => {
    setIsClosingConfirm(true);
    setTimeout(() => {
      setShowConfirm(false);
      setIsClosingConfirm(false);
    }, 160);
  };

  const handleCloseDeleteConfirm = () => {
    setIsClosingDeleteConfirm(true);
    setTimeout(() => {
      setShowDeleteConfirm(false);
      setIsClosingDeleteConfirm(false);
    }, 160);
  };

  const handleConfirmTerminate = async () => {
    setIsClosingConfirm(true);
    setTimeout(async () => {
      setShowConfirm(false);
      setIsClosingConfirm(false);
      try {
        await onTerminate("operator_manual_kill");
        notify.error(
          "Call Terminated",
          `Disconnected active phone line with scammer ${call.scammer_number}.`
        );
      } catch {
        // Handled in caller
      }
    }, 160);
  };

  const handleConfirmDelete = async () => {
    setIsDeletingCall(true);
    try {
      if (onDelete) {
        await onDelete();
      } else {
        await deleteCall(call.id);
        notify.success(
          "Call Deleted",
          `Session #${call.id.slice(0, 8)} was permanently deleted.`
        );
        router.push("/");
      }
    } catch (err: unknown) {
      notify.error(
        "Failed to Delete Call",
        err instanceof Error ? err.message : "An error occurred while deleting the session."
      );
    } finally {
      setIsDeletingCall(false);
      setShowDeleteConfirm(false);
      setIsClosingDeleteConfirm(false);
    }
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
              <h1
                className="text-lg font-bold text-zinc-100 font-mono cursor-help"
                title={call.id}
              >
                Session #{call.id.slice(0, 8)}
              </h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  LIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  Ended
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1 mb-0.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span>Date and Time:</span>
              <span className="font-mono text-zinc-200 font-medium">
                {formatCallDateTime(call.started_at)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1 mb-0.5">
              <Globe className="w-3.5 h-3.5 text-zinc-400" />
              <span>Region:</span>
              <span className="text-zinc-200">
                {formatRegionWithCountry(call)}
              </span>
            </div>
          </div>
        </div>

        {/* Timer, Delete (Ended Calls), & Termination (Active Calls) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
            <Clock className="w-4 h-4 text-zinc-400" />
            <span className="text-zinc-400">Elapsed:</span>
            <span className={`font-mono font-bold ${isActive ? "text-emerald-400" : "text-zinc-300"}`}>
              {formatDuration(elapsed)}
            </span>
          </div>

          {!isActive && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeletingCall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-300 hover:text-red-100 text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100 disabled:opacity-50"
              title="Permanently delete this ended call"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>{isDeletingCall ? "Deleting..." : "Delete Call"}</span>
            </button>
          )}

          {isActive && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isTerminating}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100 disabled:opacity-50"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              {isTerminating ? "Terminating..." : "Terminate Call"}
            </button>
          )}
        </div>
      </div>

      {/* Terminate Active Call Confirmation Modal */}
      {(showConfirm || isClosingConfirm) && (
        <div
          onClick={handleCloseConfirm}
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] ${
            isClosingConfirm ? "animate-overlay-fade-out" : "animate-overlay-fade"
          }`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md bg-zinc-900 border border-red-800/80 rounded-2xl p-6 shadow-2xl space-y-4 ${
              isClosingConfirm ? "animate-dialog-zoom-out" : "animate-dialog-zoom"
            }`}
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-zinc-100">Terminate Active Call?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to hang up the phone line immediately? This will disconnect the scammer from the gnome.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleCloseConfirm}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-all hover:scale-105 active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTerminate}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-all hover:scale-105 active:scale-95"
              >
                Yes, Terminate Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Ended Call Confirmation Modal */}
      {(showDeleteConfirm || isClosingDeleteConfirm) && (
        <div
          onClick={handleCloseDeleteConfirm}
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] ${
            isClosingDeleteConfirm ? "animate-overlay-fade-out" : "animate-overlay-fade"
          }`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md bg-zinc-900 border border-red-800/80 rounded-2xl p-6 shadow-2xl space-y-4 ${
              isClosingDeleteConfirm ? "animate-dialog-zoom-out" : "animate-dialog-zoom"
            }`}
          >
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-zinc-100">Delete Call Session?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete this call record with scammer{" "}
              <span className="font-mono font-semibold text-zinc-100">
                {call.scammer_number}
              </span>
              ? This action cannot be undone and will permanently remove audio recordings and transcripts.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleCloseDeleteConfirm}
                disabled={isDeletingCall}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeletingCall}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingCall ? "Deleting..." : "Yes, Delete Session"}</span>
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
          <div
            className="text-sm font-bold text-emerald-300 truncate cursor-help"
            title={call.gnome?.name || "Assigned Gnome"}
          >
            {call.gnome?.name || "Assigned Gnome"}
          </div>
        </div>
      </div>
    </div>
  );
};

