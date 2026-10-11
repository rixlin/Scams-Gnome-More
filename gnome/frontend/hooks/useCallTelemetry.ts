"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GnomeState, TranscriptTurn } from "../lib/types";

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

  const normalizeState = useCallback((stateStr: string): GnomeState => {
    if (stateStr === "thinking") return "crafting";
    if (stateStr === "speaking") return "responding";
    if (stateStr === "idle") return "listening";
    if (
      stateStr === "analyzing" ||
      stateStr === "crafting" ||
      stateStr === "brewing" ||
      stateStr === "responding"
    ) {
      return stateStr as GnomeState;
    }
    return "listening";
  }, []);

  useEffect(() => {
    if (!callId) return;

    const baseHost = getWsHost();
    const telemUrl = `${baseHost}/ws/live/${callId}`;

    const ws = new WebSocket(telemUrl);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("open");
    ws.onclose = () => setWsStatus("closed");
    ws.onerror = () => setWsStatus("error");

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const type = payload.type;
        const data = payload.data || payload;

        // 1. Unified Telemetry Event (or flat legacy event)
        if (type === "telemetry" || type === "active_speaker" || type === "gnome_state_step") {
          if (data.active_speaker !== undefined || data.speaker !== undefined) {
            const rawSpk = data.active_speaker || data.speaker;
            const mappedSpk = rawSpk === "caller" ? "user" : rawSpk;
            setActiveSpeaker(mappedSpk as "user" | "gnome" | "none");
          }

          if (data.gnome_state !== undefined || data.state !== undefined) {
            const rawSt = data.gnome_state || data.state;
            const mappedSt = normalizeState(rawSt);
            setCurrentGnomeState(mappedSt);
            setActiveTurnStateHistory((prev) => {
              if (prev.includes(mappedSt)) return prev;
              return [...prev, mappedSt];
            });
          }
        }

        // 2. Unified Transcript Event (or flat legacy event)
        else if (type === "transcript" || type === "transcript_chunk") {
          const rawSpk = data.speaker || "user";
          const speaker: "user" | "caller" | "gnome" | "operator" =
            rawSpk === "caller" ? "user" : rawSpk;
          const isFinal = data.final ?? data.is_final ?? true;
          const text = data.text || "";
          const turnId = data.turn_id || `turn-${data.seq ?? Date.now()}`;

          setLiveTranscript((prev) => {
            const currentList = prev.length > 0 ? prev : initialTranscript;
            const lastTurn = currentList[currentList.length - 1];

            // If same speaker and last turn wasn't final, update it
            if (lastTurn && lastTurn.speaker === speaker && !isFinal) {
              const updated: TranscriptTurn = {
                ...lastTurn,
                text,
              };
              return [...currentList.slice(0, -1), updated];
            }

            // Finalized chunk or new speaker turn
            const newTurn: TranscriptTurn = {
              id: turnId,
              speaker,
              text,
              timestamp: payload.ts || data.timestamp || new Date().toISOString(),
              state_history:
                speaker === "gnome" ? [...activeTurnStateHistory] : undefined,
              seq: data.seq,
              final: isFinal,
            };

            // If gnome completed turn, reset activeTurnStateHistory for next cycle
            if (speaker === "gnome" && isFinal) {
              setActiveTurnStateHistory(["listening"]);
              setCurrentGnomeState("listening");
            }

            return [...currentList, newTurn];
          });
        }

        // 3. Operator Feedback Live Event
        else if (type === "gnome.updated" && data.kind === "feedback") {
          const opTurn: TranscriptTurn = {
            id: `turn-operator-${Date.now()}`,
            speaker: "operator",
            text: data.text,
            timestamp: payload.ts || new Date().toISOString(),
            in_call_time: "+live",
          };
          setLiveTranscript((prev) => [...prev, opTurn]);
        }

        // 4. Call Terminated / Ended
        else if (type === "call.ended" || type === "call_terminated") {
          setIsTerminated(true);
          setActiveSpeaker("none");
          if (onCallEnded) onCallEnded();
        }
      } catch {
        // Ignored
      }
    };

    return () => {
      ws.close();
    };
  }, [callId, getWsHost, onCallEnded, activeTurnStateHistory, initialTranscript, normalizeState]);

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
