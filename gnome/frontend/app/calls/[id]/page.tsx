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
import { AlertCircle, RefreshCw } from "lucide-react";

function CallSessionContent() {
  const params = useParams();
  const router = useRouter();
  const callId = params?.id as string;

  const [call, setCall] = useState<CallSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  useEffect(() => {
    if (!callId) return;
    let active = true;

    async function loadDetail() {
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

    loadDetail();

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

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
          <>
            {/* Top Session Header & Quick Controls */}
            <SessionHeader
              call={{
                ...call,
                status: isCallActive ? "active" : "ended",
              }}
              onTerminate={handleTerminateCall}
              isTerminating={isTerminating}
            />

            {/* Overlapped Dual-Stream Audio Player */}
            <OverlappedAudioPlayer callId={call.id} />

            {/* 2-Column Live Console Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (8 cols): Live Transcript with Single-line Gnome State History */}
              <div className="lg:col-span-7 xl:col-span-8">
                <TranscriptFeed
                  transcript={transcript.length > 0 ? transcript : call.transcript}
                  gnomeName={call.gnome?.name || "Assigned Gnome"}
                  currentGnomeState={currentGnomeState}
                  activeTurnStateHistory={activeTurnStateHistory}
                  isCallActive={isCallActive}
                />
              </div>

              {/* Right Column (4 cols): Live Gnome Editor & Prompt Injections */}
              <div className="lg:col-span-5 xl:col-span-4">
                <GnomeLiveEditor
                  callId={call.id}
                  gnome={call.gnome}
                  isCallActive={isCallActive}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function CallSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-20 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          <span className="text-sm text-zinc-400">Loading call console...</span>
        </div>
      }
    >
      <CallSessionContent />
    </Suspense>
  );
}
