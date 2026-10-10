"use client";

import React, { useState } from "react";
import { Volume2, VolumeX, Mic, Bot, Headphones } from "lucide-react";
import { useOverlappedAudio } from "../../hooks/useOverlappedAudio";

interface OverlappedAudioPlayerProps {
  callId: string;
}

export const OverlappedAudioPlayer: React.FC<OverlappedAudioPlayerProps> = ({ callId }) => {
  const {
    isMuted,
    userVolume,
    gnomeVolume,
    userLevel,
    gnomeLevel,
    userWsStatus,
    gnomeWsStatus,
    setUserVolume,
    setGnomeVolume,
    toggleMute,
    ensureAudioContext,
  } = useOverlappedAudio({ callId });

  const [hasInteracted, setHasInteracted] = useState(false);

  const handleStartAudio = () => {
    ensureAudioContext();
    setHasInteracted(true);
  };

  const getStatusBadge = (status: "idle" | "connecting" | "open" | "closed" | "error") => {
    switch (status) {
      case "open":
        return <span className="text-[10px] text-emerald-400 font-mono">Connected</span>;
      case "connecting":
        return <span className="text-[10px] text-amber-400 font-mono animate-pulse">Connecting...</span>;
      case "closed":
        return <span className="text-[10px] text-zinc-500 font-mono">Idle</span>;
      case "error":
        return <span className="text-[10px] text-red-400 font-mono">Offline</span>;
      default:
        return <span className="text-[10px] text-zinc-500 font-mono">Standby</span>;
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <Headphones className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100">
            Overlapped Dual-Stream Audio Wiretap
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {!hasInteracted && (
            <button
              onClick={handleStartAudio}
              className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-lg transition-colors"
            >
              Enable Browser Audio
            </button>
          )}

          <button
            onClick={() => {
              handleStartAudio();
              toggleMute();
            }}
            className={`p-1.5 rounded-lg border transition-colors ${
              isMuted
                ? "bg-red-950/40 border-red-800/80 text-red-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white"
            }`}
            title={isMuted ? "Unmute audio wiretap" : "Mute wiretap"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Overlapped Dual Channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Channel 1: Inbound Scammer Stream */}
        <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-zinc-200">
                User / Scammer Stream
              </span>
            </div>
            {getStatusBadge(userWsStatus)}
          </div>

          {/* Level visualizer bar */}
          <div className="space-y-1">
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-75"
                style={{ width: `${userLevel}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>Activity</span>
              <span>{userLevel}%</span>
            </div>
          </div>

          {/* Channel Volume Slider */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Volume</span>
              <span className="font-mono">{Math.round(userVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={userVolume}
              onChange={(e) => {
                handleStartAudio();
                setUserVolume(parseFloat(e.target.value));
              }}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Channel 2: Outbound Gnome Stream */}
        <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-zinc-200">
                Gnome Response Stream
              </span>
            </div>
            {getStatusBadge(gnomeWsStatus)}
          </div>

          {/* Level visualizer bar */}
          <div className="space-y-1">
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-75"
                style={{ width: `${gnomeLevel}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>Activity</span>
              <span>{gnomeLevel}%</span>
            </div>
          </div>

          {/* Channel Volume Slider */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Volume</span>
              <span className="font-mono">{Math.round(gnomeVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={gnomeVolume}
              onChange={(e) => {
                handleStartAudio();
                setGnomeVolume(parseFloat(e.target.value));
              }}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      </div>

      <div className="text-[11px] text-zinc-500 text-center font-mono">
        Overlapped concurrency enabled: Both channels play independently without re-encoding.
      </div>
    </div>
  );
};

