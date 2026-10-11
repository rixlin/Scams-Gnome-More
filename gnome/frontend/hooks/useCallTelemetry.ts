"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GnomeState, TelemetryEvent, TranscriptTurn } from "../lib/types";

interface UseCallTelemetryOptions {
  callId: string;
  initialTranscript?: TranscriptTurn[];
  wsBaseUrl?: string;
  onCallEnded?: () => void;
}

export function useCallTelemetry({
  callId,
  initialTranscript = [],
  wsBaseUrl,
  onCallEnded,
}: UseCallTelemetryOptions) {
  const [activeSpeaker, setActiveSpeaker] = useState<"user" | "gnome" | "none">("none");
  const [currentGnomeState, setCurrentGnomeState] = useState<GnomeState>("listening");
  const [activeTurnStateHistory, setActiveTurnStateHistory] = useState<GnomeState[]>(["listening"]);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptTurn[]>([]);
  const [isTerminated, setIsTerminated] = useState(false);
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");

  const wsRef = useRef<WebSocket | null>(null);

  const getWsHost = useCallback(() => {
    if (wsBaseUrl) return wsBaseUrl;
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("gnome_ws_url");
      if (saved) return saved;
      const host = window.location.hostname || "localhost";
      return `ws://${host}:8000`;
    }
    return "ws://localhost:8000";
  }, [wsBaseUrl]);

  useEffect(() => {
    if (!callId) return;

    const baseHost = getWsHost();
    const telemUrl = `${baseHost}/ws/calls/${callId}/telemetry`;

    const ws = new WebSocket(telemUrl);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("open");
    ws.onclose = () => setWsStatus("closed");
    ws.onerror = () => setWsStatus("error");

    ws.onmessage = (event) => {
      try {
        const data: TelemetryEvent = JSON.parse(event.data);

        switch (data.type) {
          case "active_speaker":
            setActiveSpeaker(data.speaker);
            break;

          case "gnome_state_step":
            setCurrentGnomeState(data.state);
            setActiveTurnStateHistory((prev) => {
              if (prev.includes(data.state)) return prev;
              return [...prev, data.state];
            });
            break;

          case "transcript_chunk": {
            setLiveTranscript((prev) => {
              const currentList = prev.length > 0 ? prev : initialTranscript;
              const lastTurn = currentList[currentList.length - 1];
              const turnId = data.turn_id || `turn-${Date.now()}`;

              // If same speaker and last turn wasn't final, update it
              if (lastTurn && lastTurn.speaker === data.speaker && !data.is_final) {
                const updated: TranscriptTurn = {
                  ...lastTurn,
                  text: data.text,
                };
                return [...currentList.slice(0, -1), updated];
              }

              // Finalized chunk or new speaker turn
              const newTurn: TranscriptTurn = {
                id: turnId,
                speaker: data.speaker,
                text: data.text,
                timestamp: data.timestamp || new Date().toISOString(),
                state_history:
                  data.speaker === "gnome" ? [...activeTurnStateHistory] : undefined,
              };

              // If gnome completed turn, reset activeTurnStateHistory for next cycle
              if (data.speaker === "gnome" && data.is_final) {
                setActiveTurnStateHistory(["listening"]);
                setCurrentGnomeState("listening");
              }

              return [...currentList, newTurn];
            });
            break;
          }

          case "call_terminated":
            setIsTerminated(true);
            setActiveSpeaker("none");
            if (onCallEnded) onCallEnded();
            break;
        }
      } catch {
        // Ignored or raw text message
      }
    };

    return () => {
      ws.close();
    };
  }, [callId, getWsHost, onCallEnded, activeTurnStateHistory, initialTranscript]);

  const transcript = liveTranscript.length > 0 ? liveTranscript : initialTranscript;

  return {
    activeSpeaker,
    currentGnomeState,
    activeTurnStateHistory,
    transcript,
    isTerminated,
    wsStatus,
  };
}
