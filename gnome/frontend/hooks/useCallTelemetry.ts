"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GnomeState, TranscriptTurn } from "../lib/types";
import { getWsBaseUrl } from "../lib/api";

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
  const [prevCallId, setPrevCallId] = useState(callId);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptTurn[]>([]);

  if (callId !== prevCallId) {
    setPrevCallId(callId);
    setLiveTranscript([]);
  }

  const [isTerminated, setIsTerminated] = useState(false);
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");

  const wsRef = useRef<WebSocket | null>(null);
  const initialTranscriptRef = useRef(initialTranscript);
  const onCallEndedRef = useRef(onCallEnded);
  const activeTurnStateHistoryRef = useRef(activeTurnStateHistory);

  useEffect(() => {
    initialTranscriptRef.current = initialTranscript;
  }, [initialTranscript]);

  useEffect(() => {
    onCallEndedRef.current = onCallEnded;
  }, [onCallEnded]);

  useEffect(() => {
    activeTurnStateHistoryRef.current = activeTurnStateHistory;
  }, [activeTurnStateHistory]);

  const getWsHost = useCallback(() => wsBaseUrl || getWsBaseUrl(), [wsBaseUrl]);

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

        // 2. Unified Transcript Event
        else if (type === "transcript" || type === "transcript_chunk") {
          const rawSpk = data.speaker || "user";
          const speaker: "user" | "caller" | "gnome" | "operator" =
            rawSpk === "caller" ? "user" : rawSpk;
          const isFinal = data.final ?? data.is_final ?? true;
          const text = data.text || "";
          const turnId = data.turn_id || `turn-${data.seq ?? Date.now()}`;

          setLiveTranscript((prev) => {
            const currentList = prev.length > 0 ? prev : initialTranscriptRef.current;
            const lastTurn = currentList[currentList.length - 1];

            // If same speaker and last turn was in-progress, update in-place
            if (lastTurn && lastTurn.speaker === speaker && !lastTurn.final) {
              const updated: TranscriptTurn = {
                ...lastTurn,
                text: text || lastTurn.text,
                final: isFinal,
                seq: data.seq ?? lastTurn.seq,
              };
              return [...currentList.slice(0, -1), updated];
            }

            // Append new turn chunk
            const newTurn: TranscriptTurn = {
              id: turnId,
              speaker,
              text,
              timestamp: payload.ts || data.timestamp || new Date().toISOString(),
              state_history:
                speaker === "gnome" ? [...activeTurnStateHistoryRef.current] : undefined,
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
            final: true,
          };
          setLiveTranscript((prev) => {
            const list = prev.length > 0 ? prev : initialTranscriptRef.current;
            if (list.some((t) => t.speaker === "operator" && t.text === data.text && t.id === opTurn.id)) {
              return list;
            }
            return [...list, opTurn];
          });
        }

        // 4. Call Terminated / Ended
        else if (type === "call.ended" || type === "call_terminated") {
          setIsTerminated(true);
          setActiveSpeaker("none");
          if (onCallEndedRef.current) onCallEndedRef.current();
        }
      } catch {
        // Ignored
      }
    };

    return () => {
      ws.close();
    };
  }, [callId, getWsHost, normalizeState]);

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
