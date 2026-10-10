"use client";

import React, { useRef, useEffect } from "react";
import { MessageSquare, User, Bot } from "lucide-react";
import { GnomeState, TranscriptTurn } from "../../lib/types";
import { StateStepsLine } from "./StateStepsLine";
import { formatStartTime } from "../../lib/utils";

interface TranscriptFeedProps {
  transcript: TranscriptTurn[];
  gnomeName?: string;
  currentGnomeState?: GnomeState;
  activeTurnStateHistory?: GnomeState[];
  isCallActive?: boolean;
}

export const TranscriptFeed: React.FC<TranscriptFeedProps> = ({
  transcript,
  gnomeName = "Assigned Gnome",
  currentGnomeState,
  activeTurnStateHistory = [],
  isCallActive = true,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, currentGnomeState]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col h-[520px]">
      {/* Feed Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100">Live Wiretap Transcript</h3>
        </div>
        <span className="text-[11px] text-zinc-400 font-mono">
          {transcript.length} turns recorded
        </span>
      </div>

      {/* Transcript Scroll Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {transcript.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs">
            <p>Waiting for speech on the phone line...</p>
          </div>
        )}

        {transcript.map((turn) => {
          const isGnome = turn.speaker === "gnome";

          return (
            <div
              key={turn.id}
              className={`flex flex-col ${
                isGnome ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 space-y-2 border ${
                  isGnome
                    ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-100"
                    : "bg-zinc-950/80 border-zinc-800 text-zinc-200"
                }`}
              >
                {/* Speaker & Timestamp Header */}
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {isGnome ? (
                      <>
                        <Bot className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">{gnomeName}</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-amber-300">Scammer / Caller</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {formatStartTime(turn.timestamp)}
                  </span>
                </div>

                {/* Single-line Historical Gnome State Record */}
                {isGnome && (
                  <div className="pt-0.5 pb-1">
                    <StateStepsLine
                      isHistorical={true}
                      completedStates={
                        turn.state_history && turn.state_history.length > 0
                          ? turn.state_history
                          : ["listening", "analyzing", "crafting", "brewing", "responding"]
                      }
                    />
                  </div>
                )}

                {/* Dialogue Text */}
                <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {turn.text}
                </p>
              </div>
            </div>
          );
        })}

        {/* In-Flight Gnome Thinking/Crafting/Brewing Indicator */}
        {isCallActive && currentGnomeState && currentGnomeState !== "listening" && (
          <div className="flex flex-col items-end">
            <div className="max-w-[85%] rounded-2xl p-3 bg-zinc-950/90 border border-emerald-500/30 text-emerald-200 space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono font-medium">
                <Bot className="w-3.5 h-3.5 animate-spin" />
                <span>{gnomeName} in-progress cycle:</span>
              </div>
              <StateStepsLine
                currentActiveState={currentGnomeState}
                completedStates={activeTurnStateHistory}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};

