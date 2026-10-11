"use client";

import React from "react";
import { GnomeState, GNOME_STATE_PIPELINE } from "../../lib/types";
import { Ear, Brain, Sparkles, Flame, MessageSquare } from "lucide-react";
import { cn } from "../../lib/utils";

interface StateStepsLineProps {
  currentActiveState?: GnomeState;
  completedStates?: GnomeState[];
  className?: string;
  isHistorical?: boolean;
}

const STATE_ICONS: Record<GnomeState, React.ComponentType<{ className?: string }>> = {
  listening: Ear,
  analyzing: Brain,
  crafting: Sparkles,
  brewing: Flame,
  responding: MessageSquare,
  idle: Ear,
  thinking: Sparkles,
  speaking: MessageSquare,
};

const STATE_LABELS: Record<GnomeState, string> = {
  listening: "listening",
  analyzing: "analyzing",
  crafting: "crafting",
  brewing: "brewing",
  responding: "responding",
  idle: "listening",
  thinking: "crafting",
  speaking: "responding",
};

export const StateStepsLine: React.FC<StateStepsLineProps> = ({
  currentActiveState,
  completedStates = [],
  className,
  isHistorical = false,
}) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 flex-wrap py-1 px-2.5 rounded-md font-mono text-xs",
        isHistorical
          ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-300"
          : "bg-zinc-900 border border-zinc-800 text-zinc-300 shadow-sm",
        className
      )}
    >
      {GNOME_STATE_PIPELINE.map((state, idx) => {
        const Icon = STATE_ICONS[state];
        const isCurrent = currentActiveState === state;
        const isPassed =
          completedStates.includes(state) ||
          (currentActiveState &&
            GNOME_STATE_PIPELINE.indexOf(currentActiveState) > idx);

        return (
          <React.Fragment key={state}>
            <div
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-all",
                isCurrent &&
                  "bg-emerald-500/20 text-emerald-400 font-semibold ring-1 ring-emerald-500/60 animate-pulse",
                isPassed && !isCurrent && "text-emerald-500/80 font-medium",
                !isPassed && !isCurrent && "text-zinc-500 opacity-60"
              )}
              title={`Gnome State: ${STATE_LABELS[state]}`}
            >
              <Icon className="w-3 h-3" />
              <span>{STATE_LABELS[state]}</span>
            </div>

            {idx < GNOME_STATE_PIPELINE.length - 1 && (
              <span className="text-zinc-600 select-none">→</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

