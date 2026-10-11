"use client";

import React, { useRef, useEffect, useState } from "react";
import { MessageSquare, User, Bot, Terminal, Zap, Send, RefreshCw, X } from "lucide-react";
import { TranscriptTurn, GnomeState } from "../../lib/types";
import { formatStartTime } from "../../lib/utils";
import { updateGnomeLive } from "../../lib/api";

interface TranscriptFeedProps {
  transcript: TranscriptTurn[];
  gnomeName?: string;
  gnomeState?: GnomeState;
  isCallActive?: boolean;
  callId?: string;
  callStartedAt?: string;
  onGnomeUpdated?: () => void;
  onClose?: () => void;
  className?: string;
}

function getElapsedCallTime(turn: TranscriptTurn, callStartedAt?: string, fallbackBaseMs?: number): string {
  if (turn.in_call_time) {
    return turn.in_call_time;
  }
  const baseMs = callStartedAt ? new Date(callStartedAt).getTime() : fallbackBaseMs;
  if (!baseMs || isNaN(baseMs)) {
    return "+00:00";
  }
  const turnMs = new Date(turn.timestamp).getTime();
  if (isNaN(turnMs)) {
    return "+00:00";
  }
  const diffSec = Math.max(0, Math.floor((turnMs - baseMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `+${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export const TranscriptFeed: React.FC<TranscriptFeedProps> = ({
  transcript,
  gnomeName = "Assigned Gnome",
  gnomeState = "listening",
  isCallActive = true,
  callId,
  callStartedAt,
  onGnomeUpdated,
  onClose,
  className = "",
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef<number>(0);
  const fallbackBaseMs = transcript.length > 0 ? new Date(transcript[0].timestamp).getTime() : undefined;

  const [feedbackInput, setFeedbackInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-scroll to bottom on mount and when new turns arrive
  useEffect(() => {
    if (transcript.length > 0) {
      if (prevCountRef.current === 0) {
        // Immediate scroll to bottom on initial load
        bottomRef.current?.scrollIntoView({ behavior: "auto" });
      } else if (transcript.length > prevCountRef.current) {
        // Smooth scroll when new message is appended
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      prevCountRef.current = transcript.length;
    }
  }, [transcript.length]);

  // Lines grow word by word while someone is speaking; keep the newest words in view
  const totalTextLength = transcript.reduce((n, t) => n + t.text.length, 0);
  useEffect(() => {
    if (prevCountRef.current > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [totalTextLength]);

  const handleSendPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = feedbackInput.trim();
    if (!trimmed || !callId || submitting) return;

    setSubmitting(true);
    setToastMessage(null);

    try {
      await updateGnomeLive(callId, {
        feedback: trimmed,
      });

      setFeedbackInput("");
      setToastMessage("Feedback interjected.");
      if (onGnomeUpdated) onGnomeUpdated();
      setTimeout(() => setToastMessage(null), 2500);
    } catch {
      setToastMessage("Failed to send prompt.");
      setTimeout(() => setToastMessage(null), 2500);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-2xl shadow-lg flex flex-col h-full min-h-0 overflow-hidden ${className}`}
    >
      {/* Header (Pinned Top) */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100">Live Transcript</h3>
        </div>
        <div className="flex items-center gap-2.5">
          {toastMessage && (
            <span className="text-[10px] text-emerald-400 font-mono animate-in fade-in">
              {toastMessage}
            </span>
          )}
          <span className="text-[11px] text-zinc-400 font-mono">
            {transcript.length} messages
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all hover:scale-105 active:scale-95"
              title="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Transcript Scroll Area: min-h-0 flex-1 overflow-y-auto ensures history is 100% scrollable */}
      <div
        ref={scrollAreaRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5"
      >
        <div className="min-h-full flex flex-col space-y-4">
          {/* Flexible top spacer: pushes messages to bottom when content is short without breaking scrolling when long */}
          <div className="flex-1 min-h-0" />

          {transcript.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-xs">
              <p>Waiting for speech on the phone line...</p>
            </div>
          )}

          {transcript.map((turn) => {
            // 1. Operator Interjection Turn
            if (turn.speaker === "operator") {
              return (
                <div key={turn.id} className="flex justify-center py-2 shrink-0">
                  <div className="w-full max-w-[95%] rounded-xl p-3.5 bg-indigo-950/40 border border-indigo-700/50 shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-indigo-400 font-semibold font-mono">
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Operator Feedback Interjection</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                        <span className="bg-indigo-900/60 px-1.5 py-0.5 rounded text-indigo-200">
                          {getElapsedCallTime(turn, callStartedAt, fallbackBaseMs)}
                        </span>
                        <span>{formatStartTime(turn.timestamp)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-100 leading-relaxed font-sans">
                      {turn.text}
                    </p>
                  </div>
                </div>
              );
            }

            // 2. Caller or Gnome Dialogue Turn
            const isGnome = turn.speaker === "gnome";

            return (
              <div
                key={turn.id}
                className={`flex flex-col shrink-0 ${
                  isGnome ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-4 space-y-2 border ${
                    isGnome
                      ? "bg-emerald-950/30 border-emerald-800/40 text-zinc-100"
                      : "bg-zinc-950/80 border-zinc-800 text-zinc-100"
                  }`}
                >
                  {/* Speaker & Timestamps Header */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {isGnome ? (
                        <>
                          <Bot className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span
                            className="text-emerald-500 font-bold cursor-help"
                            title={gnomeName}
                          >
                            {gnomeName}
                          </span>
                        </>
                      ) : (
                        <>
                          <User className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-amber-500 font-bold">Scammer</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                      <span className="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
                        {getElapsedCallTime(turn, callStartedAt, fallbackBaseMs)}
                      </span>
                      <span>{formatStartTime(turn.timestamp)}</span>
                    </div>
                  </div>

                  {/* Optional Feedback Cue Indicator */}
                  {turn.feedback_cue && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-950/50 border border-indigo-700/40 text-[10px] text-indigo-300 font-mono">
                      <Zap className="w-3 h-3 text-indigo-400" />
                      <span>{turn.feedback_cue}</span>
                    </div>
                  )}

                  {/* Dialogue Text */}
                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans text-zinc-100">
                    {turn.text}
                  </p>
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} className="h-1 shrink-0" />
        </div>
      </div>

      {/* Direct Prompt Injection Message Box at the Bottom (Pinned Bottom) */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/90">
        {isCallActive && callId ? (
          <div className="p-3 pt-2.5 space-y-2">
            {/* Current Gnome State Indicator */}
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>
                <span
                  className="text-zinc-200 font-semibold cursor-help"
                  title={gnomeName}
                >
                  {gnomeName}
                </span>{" "}
                is{" "}
                <span className="text-emerald-400 font-semibold lowercase">
                  {gnomeState}
                </span>
                ...
              </span>
            </div>

            <form
              onSubmit={handleSendPrompt}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={feedbackInput}
                onChange={(e) => setFeedbackInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={submitting}
                placeholder="Direct prompt injection to gnome..."
                className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-emerald-500/80 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!feedbackInput.trim() || submitting}
                className="flex items-center justify-center p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100 disabled:opacity-40 disabled:hover:bg-emerald-600 shrink-0"
                title="Send prompt injection"
              >
                {submitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="py-2.5 px-4 text-center text-xs text-zinc-500 font-mono">
            Call session ended &mdash; Transcript is read-only
          </div>
        )}
      </div>
    </div>
  );
};
