"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Volume2,
  VolumeX,
  Mic,
  Bot,
  Headphones,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  FileAudio,
  FileX,
  Download,
} from "lucide-react";
import { useOverlappedAudio } from "../../hooks/useOverlappedAudio";
import { CallSessionDetail, AudioPlaybackMode } from "../../lib/types";
import { formatDuration } from "../../lib/utils";
import { unpackStereoWav, UnpackedStereoAudio } from "../../lib/wav-utils";

interface OverlappedAudioPlayerProps {
  callId: string;
  isCallActive?: boolean;
  call?: CallSessionDetail | null;
}

export const OverlappedAudioPlayer: React.FC<OverlappedAudioPlayerProps> = ({
  callId,
  isCallActive = true,
  call,
}) => {
  const isEnded = isCallActive === false || (call && call.status === "ended");

  // ==========================================
  // 1. ACTIVE CALL: LIVE WIRETAP STATE & HOOKS
  // ==========================================
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

  // By default, call recordings / audio wiretaps are NOT played
  const [isListening, setIsListening] = useState(false);

  const handleStartListening = () => {
    ensureAudioContext();
    if (isMuted) {
      toggleMute();
    }
    setIsListening(true);
  };

  const handlePauseListening = () => {
    if (!isMuted) {
      toggleMute();
    }
    setIsListening(false);
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

  // ==========================================
  // 2. ENDED CALL: SINGLE PLAYBACK BAR STATE
  // ==========================================
  const isDebugCall =
    callId.startsWith("call-debug") || Boolean(call?.id && call.id.startsWith("call-debug"));

  const isRecordingUnavailable =
    isDebugCall ||
    call?.recording_status === "unavailable" ||
    !call?.recording_url;

  // Active playback mode: "stereo" (default) or "mono" (unpacked dual streams)
  const [playbackMode, setPlaybackMode] = useState<AudioPlaybackMode>(() => {
    if (typeof window !== "undefined") {
      return (window.localStorage.getItem("gnome_playback_mode") as AudioPlaybackMode) || "stereo";
    }
    return "stereo";
  });

  useEffect(() => {
    const handleModeChange = () => {
      const mode = (window.localStorage.getItem("gnome_playback_mode") as AudioPlaybackMode) || "stereo";
      setPlaybackMode(mode);
    };
    window.addEventListener("gnome_playback_mode_changed", handleModeChange);
    window.addEventListener("storage", handleModeChange);
    return () => {
      window.removeEventListener("gnome_playback_mode_changed", handleModeChange);
      window.removeEventListener("storage", handleModeChange);
    };
  }, []);

  const initialRecordedDuration = call?.duration_seconds || 145;
  const [recordedDuration, setRecordedDuration] = useState<number>(initialRecordedDuration);
  const [recordedCurrentTime, setRecordedCurrentTime] = useState<number>(0);
  const [isRecordedPlaying, setIsRecordedPlaying] = useState<boolean>(false);
  const [recordedVolume, setRecordedVolume] = useState<number>(0.85);
  const [isRecordedMuted, setIsRecordedMuted] = useState<boolean>(false);

  // Stereo playback ref
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Mono unpacked playback refs & state
  const [unpackedAudio, setUnpackedAudio] = useState<UnpackedStereoAudio | null>(null);
  const callerAudioRef = useRef<HTMLAudioElement | null>(null);
  const gnomeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch and unpack 2-channel WAV into dual mono streams when mono mode is active
  useEffect(() => {
    if (!isEnded || isRecordingUnavailable || playbackMode !== "mono" || !call?.recording_url) {
      return;
    }

    let active = true;
    let localResult: UnpackedStereoAudio | null = null;

    fetch(call.recording_url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch recording WAV");
        return res.arrayBuffer();
      })
      .then(async (arrayBuffer) => {
        if (!active) return;
        const result = await unpackStereoWav(arrayBuffer);
        if (!active) {
          URL.revokeObjectURL(result.callerBlobUrl);
          URL.revokeObjectURL(result.gnomeBlobUrl);
          return;
        }
        localResult = result;
        setUnpackedAudio(result);
        if (result.durationSeconds > 0) {
          setRecordedDuration(result.durationSeconds);
        }
      })
      .catch((err) => {
        console.warn("Could not unpack stereo audio to mono channels:", err);
      });

    return () => {
      active = false;
      if (localResult) {
        URL.revokeObjectURL(localResult.callerBlobUrl);
        URL.revokeObjectURL(localResult.gnomeBlobUrl);
      }
      setUnpackedAudio(null);
    };
  }, [isEnded, isRecordingUnavailable, playbackMode, call?.recording_url]);

  // Simulated playback interval if no audio elements loaded
  useEffect(() => {
    if (!isEnded || isRecordingUnavailable || !isRecordedPlaying) return;

    if (playbackMode === "mono" && unpackedAudio && callerAudioRef.current) {
      callerAudioRef.current.play().catch(() => {});
      gnomeAudioRef.current?.play().catch(() => {});
      return;
    }

    if (call?.recording_url && audioElRef.current) {
      audioElRef.current.play().catch(() => {});
      return;
    }

    const timer = setInterval(() => {
      setRecordedCurrentTime((prev) => {
        if (prev >= recordedDuration) {
          setIsRecordedPlaying(false);
          return recordedDuration;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isEnded, isRecordingUnavailable, isRecordedPlaying, recordedDuration, call?.recording_url, playbackMode, unpackedAudio]);

  // With cacheComponents, navigating away hides this page instead of unmounting it, so the
  // <audio> elements stay alive. Effect cleanups still run on hide, so pause playback here.
  // Elements are tracked in a Set (not the DOM refs) since React may detach refs before cleanup.
  const playedAudioElsRef = useRef<Set<HTMLAudioElement>>(new Set());
  const trackPlayedAudio = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    playedAudioElsRef.current.add(e.currentTarget);
  };

  useEffect(() => {
    const playedAudioEls = playedAudioElsRef.current;
    return () => {
      playedAudioEls.forEach((el) => el.pause());
      playedAudioEls.clear();
      setIsRecordedPlaying(false);
    };
  }, []);

  const updateAudioVolumeAndMute = (vol: number, muted: boolean) => {
    if (playbackMode === "mono" && unpackedAudio) {
      if (callerAudioRef.current) {
        callerAudioRef.current.volume = muted ? 0 : vol;
        callerAudioRef.current.muted = muted;
      }
      if (gnomeAudioRef.current) {
        gnomeAudioRef.current.volume = muted ? 0 : vol;
        gnomeAudioRef.current.muted = muted;
      }
    } else if (audioElRef.current) {
      audioElRef.current.volume = muted ? 0 : vol;
      audioElRef.current.muted = muted;
    }
  };

  const handleToggleRecordedPlay = () => {
    if (playbackMode === "mono" && unpackedAudio) {
      if (isRecordedPlaying) {
        callerAudioRef.current?.pause();
        gnomeAudioRef.current?.pause();
        setIsRecordedPlaying(false);
      } else {
        const p1 = callerAudioRef.current?.play();
        const p2 = gnomeAudioRef.current?.play();
        Promise.allSettled([p1, p2]).then(() => {
          setIsRecordedPlaying(true);
        }).catch(() => {});
      }
      return;
    }

    if (call?.recording_url && audioElRef.current) {
      if (isRecordedPlaying) {
        audioElRef.current.pause();
        setIsRecordedPlaying(false);
      } else {
        audioElRef.current.play().then(() => {
          setIsRecordedPlaying(true);
        }).catch(() => {});
      }
      return;
    }

    setIsRecordedPlaying((prev) => !prev);
  };

  const handleSeekRecorded = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = parseFloat(e.target.value);
    setRecordedCurrentTime(nextTime);
    if (playbackMode === "mono" && unpackedAudio) {
      if (callerAudioRef.current) callerAudioRef.current.currentTime = nextTime;
      if (gnomeAudioRef.current) gnomeAudioRef.current.currentTime = nextTime;
    } else if (audioElRef.current) {
      audioElRef.current.currentTime = nextTime;
    }
  };

  const handleSkipRecorded = (delta: number) => {
    setRecordedCurrentTime((prev) => {
      const target = Math.max(0, Math.min(recordedDuration, prev + delta));
      if (playbackMode === "mono" && unpackedAudio) {
        if (callerAudioRef.current) callerAudioRef.current.currentTime = target;
        if (gnomeAudioRef.current) gnomeAudioRef.current.currentTime = target;
      } else if (audioElRef.current) {
        audioElRef.current.currentTime = target;
      }
      return target;
    });
  };

  const handleMonoTimeUpdate = () => {
    if (!callerAudioRef.current) return;
    const cur = callerAudioRef.current.currentTime;
    setRecordedCurrentTime(cur);

    // Keep gnome stream tightly synchronized if drift > 0.08s
    if (gnomeAudioRef.current) {
      const diff = Math.abs(gnomeAudioRef.current.currentTime - cur);
      if (diff > 0.08) {
        gnomeAudioRef.current.currentTime = cur;
      }
    }
  };

  const handleMonoEnded = () => {
    setIsRecordedPlaying(false);
    if (gnomeAudioRef.current) {
      gnomeAudioRef.current.pause();
    }
  };

  // ==========================================
  // RENDER: ENDED CALL MODE
  // ==========================================
  if (isEnded) {
    if (isRecordingUnavailable) {
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between min-h-[40px] pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2.5">
              <FileAudio className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-bold text-zinc-100">
                Call Audio Playback
              </h3>
            </div>
            <div className="flex items-center min-h-[28px]">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 leading-none">
                Recording Unavailable
              </span>
            </div>
          </div>

          {/* Unavailable Message Box */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 rounded-lg bg-zinc-800/80 text-zinc-400 shrink-0 border border-zinc-700/50">
              <FileX className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-200">
                Call recording is no longer available
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                {isDebugCall
                  ? "Debug calls are simulated and are not recorded."
                  : "The audio recording for this session is no longer available."}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Available Single-File Recording Playback Menu
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between min-h-[40px] pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <FileAudio className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-100">
              Call Audio Playback
            </h3>
          </div>
          <div className="flex items-center gap-2 min-h-[28px]">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 leading-none">
              Recording Available
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60 leading-none">
              {playbackMode === "mono" ? (!unpackedAudio ? "Unpacking..." : "Mono 1-Ch") : "Stereo 2-Ch"}
            </span>
          </div>
        </div>

        {/* Audio Elements */}
        {call?.recording_url && (
          playbackMode === "mono" && unpackedAudio ? (
            <>
              <audio
                ref={callerAudioRef}
                src={unpackedAudio.callerBlobUrl}
                onLoadedMetadata={(e) => {
                  const el = e.target as HTMLAudioElement;
                  el.volume = isRecordedMuted ? 0 : recordedVolume;
                  el.muted = isRecordedMuted;
                  el.currentTime = recordedCurrentTime;
                  if (!isNaN(el.duration) && el.duration > 0) setRecordedDuration(el.duration);
                }}
                onPlay={trackPlayedAudio}
                onTimeUpdate={handleMonoTimeUpdate}
                onEnded={handleMonoEnded}
              />
              <audio
                ref={gnomeAudioRef}
                src={unpackedAudio.gnomeBlobUrl}
                onPlay={trackPlayedAudio}
                onLoadedMetadata={(e) => {
                  const el = e.target as HTMLAudioElement;
                  el.volume = isRecordedMuted ? 0 : recordedVolume;
                  el.muted = isRecordedMuted;
                  el.currentTime = recordedCurrentTime;
                }}
              />
            </>
          ) : (
            <audio
              ref={audioElRef}
              src={call.recording_url}
              onPlay={trackPlayedAudio}
              onTimeUpdate={(e) => setRecordedCurrentTime((e.target as HTMLAudioElement).currentTime)}
              onLoadedMetadata={(e) => {
                const dur = (e.target as HTMLAudioElement).duration;
                if (!isNaN(dur) && dur > 0) setRecordedDuration(dur);
              }}
              onEnded={() => setIsRecordedPlaying(false)}
            />
          )
        )}

        {/* Playback Menu: Single Playback Bar & Time Display */}
        <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
          <div className="space-y-1.5">
            <input
              type="range"
              min={0}
              max={recordedDuration || 1}
              step={0.1}
              value={recordedCurrentTime}
              onChange={handleSeekRecorded}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>{formatDuration(recordedCurrentTime)}</span>
              <span>{formatDuration(recordedDuration)}</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSkipRecorded(-10)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={handleToggleRecordedPlay}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 transition-all hover:scale-105 active:scale-95"
                title={isRecordedPlaying ? "Pause recording" : "Play recording"}
              >
                {isRecordedPlaying ? (
                  <Pause className="w-4 h-4 fill-white" />
                ) : (
                  <Play className="w-4 h-4 fill-white ml-0.5" />
                )}
              </button>

              <button
                onClick={() => handleSkipRecorded(10)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
                title="Forward 10 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Volume & Download */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const nextMuted = !isRecordedMuted;
                    setIsRecordedMuted(nextMuted);
                    updateAudioVolumeAndMute(recordedVolume, nextMuted);
                  }}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
                  title={isRecordedMuted ? "Unmute" : "Mute"}
                >
                  {isRecordedMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isRecordedMuted ? 0 : recordedVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setRecordedVolume(val);
                    if (isRecordedMuted) setIsRecordedMuted(false);
                    updateAudioVolumeAndMute(val, false);
                  }}
                  className="w-16 sm:w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {call?.recording_url && (
                <a
                  href={call.recording_url}
                  download
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors"
                  title="Download complete recording file"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-zinc-500 text-center font-mono">
          {playbackMode === "mono"
            ? "Caller and gnome streams are unpacked into dual simultaneous mono streams."
            : "Caller and gnome streams are merged into a single stereo stream."}
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: ACTIVE CALL DUAL WIRETAP MODE
  // ==========================================
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between min-h-[40px] pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <FileAudio className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100">
            Call Audio Playback
          </h3>
        </div>

        {/* When paused (!isListening): hide mute/unmute icon, show "Streaming" label */}
        {/* When unpaused (isListening): hide "Streaming" label, restore pause button and mute/unmute icon */}
        {!isListening ? (
          <div className="flex items-center min-h-[28px]">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Streaming
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-h-[28px]">
            <button
              onClick={handlePauseListening}
              className="h-7 flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-500 text-white border border-red-500 px-2.5 rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md font-semibold"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Stream</span>
            </button>

            <button
              onClick={toggleMute}
              className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all hover:scale-105 active:scale-95 ${
                isMuted
                  ? "bg-red-950/40 border-red-800/80 text-red-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-zinc-100"
              }`}
              title={isMuted ? "Unmute audio wiretap" : "Mute wiretap"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Dual Channels Container with Default Blur Overlay */}
      <div className="relative rounded-xl overflow-hidden">
        {/* Blurred Content: Volume Sliders & Activity Meters */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition-all duration-300 ${
            !isListening
              ? "filter blur-[3.5px] select-none pointer-events-none opacity-40"
              : "blur-0 opacity-100"
          }`}
        >
          {/* Channel 1: Inbound Scammer Stream */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-200">
                  Scammer Stream
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
                  Gnome Stream
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
                  setGnomeVolume(parseFloat(e.target.value));
                }}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Start Wiretap Button Overlay (Displayed when not playing / listening) */}
        {!isListening && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-zinc-950/45 backdrop-blur-[1px] rounded-xl text-center space-y-3 animate-in fade-in">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
              <Headphones className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-100">Audio Streaming Paused</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5 max-w-xs leading-relaxed">
                Audio streams are paused by default to prevent unnecessary bandwidth usage and maintain privacy.
              </p>
            </div>
            <button
              onClick={handleStartListening}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/40 transition-all hover:scale-105 active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start Stream</span>
            </button>
          </div>
        )}
      </div>

      <div className="text-[11px] text-zinc-500 text-center font-mono">
        Streams are simultaneously overlapped. Caller and gnome streams are not re-encoded.
      </div>
    </div>
  );
};
