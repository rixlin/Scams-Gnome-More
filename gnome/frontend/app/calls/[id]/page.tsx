"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { CallSessionDetail } from "../../../lib/types";
import { fetchCallDetail, terminateCall } from "../../../lib/api";
import { SessionHeader } from "../../../components/session/SessionHeader";
import { OverlappedAudioPlayer } from "../../../components/session/OverlappedAudioPlayer";
import { TranscriptFeed } from "../../../components/session/TranscriptFeed";
import { GnomeLiveEditor } from "../../../components/session/GnomeLiveEditor";
import { Navbar } from "../../../components/layout/Navbar";
import { useCallTelemetry } from "../../../hooks/useCallTelemetry";
import {
  AlertCircle,
  RefreshCw,
  MessageSquare,
  ChevronLeft,
} from "lucide-react";

function CallSessionContent() {
  const params = useParams();
  const router = useRouter();
  const callId = params?.id as string;

  const [call, setCall] = useState<CallSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const reloadDetail = useCallback(async () => {
    if (!callId) return;
    try {
      const data = await fetchCallDetail(callId);
      setCall(data);
    } catch {}
  }, [callId]);

  useEffect(() => {
    if (!callId) return;
    let active = true;

    async function fetchInitialDetail() {
      try {
        const data = await fetchCallDetail(callId);
        if (active) {
          setCall(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load call session.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchInitialDetail();

    return () => {
      active = false;
    };
  }, [callId]);

  const handleCallEndedTelemetry = useCallback(() => {
    setCall((prev) => (prev ? { ...prev, status: "ended" } : null));
  }, []);

  // Hook into live telemetry feed
  const {
    currentGnomeState,
    activeTurnStateHistory,
    transcript,
    isTerminated,
  } = useCallTelemetry({
    callId,
    initialTranscript: call?.transcript || [],
    onCallEnded: handleCallEndedTelemetry,
  });

  const handleTerminateCall = async (reason: string = "operator_manual_kill") => {
    if (!callId) return;
    setIsTerminating(true);
    try {
      await terminateCall(callId, reason);
      setCall((prev) => (prev ? { ...prev, status: "ended" } : null));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Termination failed.");
    } finally {
      setIsTerminating(false);
    }
  };

  const isCallActive = call?.status === "active" && !isTerminated;
  const turnsCount = transcript.length > 0 ? transcript.length : call?.transcript?.length || 0;

  return (
    <div className="h-screen max-h-screen bg-canvas text-zinc-100 flex flex-col font-sans w-full overflow-hidden">
      <Navbar />

      <main className="w-full px-4 sm:px-6 xl:px-8 py-3 flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center p-20 text-zinc-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
            <span className="text-sm">Connecting to session #{callId}...</span>
          </div>
        )}

        {error && (
          <div className="p-6 rounded-2xl bg-zinc-900 border border-red-800/60 space-y-3">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <h2 className="text-base font-bold">Failed to load session</h2>
            </div>
            <p className="text-xs text-zinc-400">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg"
            >
              Return to Dashboard
            </button>
          </div>
        )}

        {call && (
          <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-6 relative overflow-hidden">
            {/* Left Half: Scrollable column on Desktop, full height scroll */}
            <div className="w-full xl:w-1/2 flex flex-col space-y-4 overflow-y-auto min-h-0 h-full pr-1 sm:pr-2 pb-6">
              <SessionHeader
                call={{
                  ...call,
                  status: isCallActive ? "active" : "ended",
                }}
                onTerminate={handleTerminateCall}
                isTerminating={isTerminating}
              />

              <OverlappedAudioPlayer callId={call.id} />

              <GnomeLiveEditor
                callId={call.id}
                gnome={call.gnome}
                isCallActive={isCallActive}
                onGnomeUpdated={reloadDetail}
              />
            </div>

            {/* Right Half on Desktop: Pinned fixed window height, full flex-1 height */}
            <div className="hidden xl:flex xl:w-1/2 h-full min-h-0 flex-col overflow-hidden pb-1">
              <TranscriptFeed
                callId={call.id}
                transcript={transcript.length > 0 ? transcript : call.transcript}
                gnomeName={call.gnome?.name || "Assigned Gnome"}
                currentGnomeState={currentGnomeState}
                activeTurnStateHistory={activeTurnStateHistory}
                isCallActive={isCallActive}
                onGnomeUpdated={reloadDetail}
                className="h-full flex-1 min-h-0"
              />
            </div>

            {/* Pinned Button on the Right Side (Visible on mobile / screens < lg) */}
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="xl:hidden fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 px-2 rounded-l-2xl shadow-2xl flex flex-col items-center gap-2 transition-all font-mono text-xs border-y border-l border-emerald-400/50"
              title="Open Live Transcript"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="[writing-mode:vertical-lr] tracking-widest font-bold text-[10px]">
                TRANSCRIPT ({turnsCount})
              </span>
              <ChevronLeft className="w-3.5 h-3.5 animate-pulse" />
            </button>

            {/* Slide-out Backdrop when drawer is open on mobile */}
            {isMobileDrawerOpen && (
              <div
                onClick={() => setIsMobileDrawerOpen(false)}
                className="xl:hidden fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] animate-in fade-in"
              />
            )}

            {/* Slide-out Transcript Drawer from the right edge on mobile / narrow view */}
            <div
              className={`xl:hidden fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] h-full max-h-screen bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col min-h-0 overflow-hidden transition-transform duration-300 ease-in-out ${
                isMobileDrawerOpen
                  ? "translate-x-0"
                  : "translate-x-full pointer-events-none"
              }`}
            >
              <TranscriptFeed
                callId={call.id}
                transcript={transcript.length > 0 ? transcript : call.transcript}
                gnomeName={call.gnome?.name || "Assigned Gnome"}
                currentGnomeState={currentGnomeState}
                activeTurnStateHistory={activeTurnStateHistory}
                isCallActive={isCallActive}
                onGnomeUpdated={reloadDetail}
                onClose={() => setIsMobileDrawerOpen(false)}
                className="h-full rounded-none border-none min-h-0"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CallSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas text-zinc-100 flex items-center justify-center p-20 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          <span className="text-sm text-zinc-400">Loading call console...</span>
        </div>
      }
    >
      <CallSessionContent />
    </Suspense>
  );
}
