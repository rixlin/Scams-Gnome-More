"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Settings as SettingsIcon,
  Check,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  Server,
  Bug,
  Palette,
  ChevronDown,
  Activity,
  Volume2,
} from "lucide-react";
import {
  fetchSettings,
  updateSettings,
  pingRest,
  pingWs,
  getBaseUrl,
  getWsBaseUrl,
  BACKEND_URL_CHANGED_EVENT,
  setGnomeMode as setGnomeModeApi,
  fetchGnomeMode,
} from "../../lib/api";
import { CallSessionSummary, AudioPlaybackMode, GnomeMode } from "../../lib/types";
import { createSampleDebugCallDetail } from "../../lib/debug-call-generator";
import { useTheme } from "../theme/ThemeProvider";
import { THEME_OPTIONS } from "../../lib/theme";
import { useNotification } from "../notifications/NotificationProvider";
import { useHideNumbers } from "../../hooks/useHideNumbers";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDebugCall?: (call: CallSessionSummary) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onAddDebugCall,
}) => {
  const { notify } = useNotification();
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<"frontend" | "system" | "debug">("frontend");
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio Playback Mode state
  const [playbackMode, setPlaybackMode] = useState<AudioPlaybackMode>(() => {
    if (typeof window !== "undefined") {
      return (window.localStorage.getItem("gnome_playback_mode") as AudioPlaybackMode) || "stereo";
    }
    return "stereo";
  });

  const { hideNumbers, setHideNumbers } = useHideNumbers();

  const { theme, setTheme, currentOption } = useTheme();
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [isDropdownClosing, setIsDropdownClosing] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement | null>(null);

  const closeThemeDropdown = useCallback(() => {
    setIsDropdownClosing(true);
    setTimeout(() => {
      setIsThemeDropdownOpen(false);
      setIsDropdownClosing(false);
    }, 140);
  }, []);

  const toggleThemeDropdown = useCallback(() => {
    if (isThemeDropdownOpen) {
      closeThemeDropdown();
    } else {
      setIsThemeDropdownOpen(true);
    }
  }, [isThemeDropdownOpen, closeThemeDropdown]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        themeDropdownRef.current &&
        !themeDropdownRef.current.contains(event.target as Node)
      ) {
        if (isThemeDropdownOpen) {
          closeThemeDropdown();
        }
      }
    }
    if (isThemeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isThemeDropdownOpen, closeThemeDropdown]);

  // System Settings state
  const [backendUrl, setBackendUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("gnome_backend_url") || getBaseUrl();
    }
    return getBaseUrl();
  });

  const [wsUrl, setWsUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("gnome_ws_url") || getWsBaseUrl();
    }
    return getWsBaseUrl();
  });

  const [autoTerminateSeconds, setAutoTerminateSeconds] = useState(1800);
  const [aggression, setAggression] = useState(3);
  const [defaultPersonality, setDefaultPersonality] = useState("");
  const [generateNewGnome, setGenerateNewGnome] = useState(true);
  const [gnomeMode, setGnomeMode] = useState<GnomeMode>("destroyer");
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);

  // Ping test states
  const [restPingState, setRestPingState] = useState<{
    status: "idle" | "pinging" | "success" | "error";
    latency?: number;
    message?: string;
  }>({ status: "idle" });

  const [wsPingState, setWsPingState] = useState<{
    status: "idle" | "pinging" | "success" | "error";
    latency?: number;
    message?: string;
  }>({ status: "idle" });

  const handlePingRest = async () => {
    setRestPingState({ status: "pinging" });
    const result = await pingRest(backendUrl);
    if (result.ok) {
      setRestPingState({
        status: "success",
        latency: result.latencyMs,
        message: result.message,
      });
    } else {
      setRestPingState({
        status: "error",
        latency: result.latencyMs,
        message: result.message || "Failed to reach REST endpoint",
      });
    }
  };

  const handlePingWs = async () => {
    setWsPingState({ status: "pinging" });
    const result = await pingWs(wsUrl);
    if (result.ok) {
      setWsPingState({
        status: "success",
        latency: result.latencyMs,
        message: result.message,
      });
    } else {
      setWsPingState({
        status: "error",
        latency: result.latencyMs,
        message: result.message || "Failed to reach WebSocket endpoint",
      });
    }
  };

  const handlePlaybackModeChange = (mode: AudioPlaybackMode) => {
    setPlaybackMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("gnome_playback_mode", mode);
      window.dispatchEvent(new Event("gnome_playback_mode_changed"));
    }
    notify.success(
      "Audio Setting Updated",
      `Recorded audio playback mode set to ${
        mode === "stereo" ? "Stereo (2-Channel)" : "Mono (1-Channel)"
      }.`
    );
  };

  const handleToggleHideNumbers = (enabled: boolean) => {
    setHideNumbers(enabled);
    notify.success(
      enabled ? "Numbers Hidden" : "Numbers Visible",
      enabled
        ? "Phone numbers across the console are now obfuscated."
        : "Phone numbers across the console are now visible."
    );
  };

  // Debug Call Form state
  const [debugScammerNumber, setDebugScammerNumber] = useState("+1 (555) 392-8172");
  const [debugRegion, setDebugRegion] = useState("New York, NY");
  const [debugCountry, setDebugCountry] = useState("USA");
  const [debugGnomeNumber, setDebugGnomeNumber] = useState("+1 (800) 420-GNOM");
  const [debugGnomeName, setDebugGnomeName] = useState("Barnaby");

  // Load backend settings on open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    fetchSettings()
      .then((settings) => {
        if (!active) return;
        // The URL fields always show what THIS browser connects with (its saved settings), never the
        // backend's copy: that copy can differ per machine, and showing it hid a stale localhost URL.
        setBackendUrl(getBaseUrl());
        setWsUrl(getWsBaseUrl());
        if (settings.max_call_seconds) {
          setAutoTerminateSeconds(settings.max_call_seconds);
        } else if (settings.auto_terminate_seconds) {
          setAutoTerminateSeconds(settings.auto_terminate_seconds);
        }
        if (settings.aggression !== undefined) {
          setAggression(settings.aggression);
        }
        if (settings.default_personality !== undefined) {
          setDefaultPersonality(settings.default_personality);
        }
        if (settings.generate_new_gnome_per_call !== undefined) {
          setGenerateNewGnome(settings.generate_new_gnome_per_call);
        }
        if (settings.gnome_mode !== undefined) {
          setGnomeMode(settings.gnome_mode);
        }
      })
      .catch(() => {
        // Fall back to default local state if backend is offline
      });

    fetchGnomeMode()
      .then((mode) => {
        if (active) setGnomeMode(mode);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleToggleGnomeMode = async (enabled: boolean) => {
    const nextMode: GnomeMode = enabled ? "whimsy" : "destroyer";
    setGnomeMode(nextMode);
    setIsUpdatingMode(true);
    try {
      await setGnomeModeApi(nextMode, true);
      notify.success(
        enabled ? "Whimsy Mode Enabled" : "Whimsy Mode Disabled",
        enabled
          ? "The gnome will act for fun and no longer attack scammers."
          : "The gnome will actively counter and disrupt scammers."
      );
    } catch {
      notify.warning(
        "Mode Notice",
        "Could not immediately sync mode to server. It will be saved when you save server settings."
      );
    } finally {
      setIsUpdatingMode(false);
    }
  };

  const handleSaveSystemSettings = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSavedSuccess(false);

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("gnome_backend_url", backendUrl);
        window.localStorage.setItem("gnome_ws_url", wsUrl);
        window.localStorage.setItem("gnome_playback_mode", playbackMode);
        window.localStorage.setItem("gnome_hide_numbers", hideNumbers ? "true" : "false");
        window.dispatchEvent(new Event(BACKEND_URL_CHANGED_EVENT));
      }

      await updateSettings({
        backend_api_url: backendUrl,
        backend_ws_url: wsUrl,
        auto_terminate_seconds: autoTerminateSeconds,
        max_call_seconds: autoTerminateSeconds,
        aggression,
        default_personality: defaultPersonality,
        generate_new_gnome_per_call: generateNewGnome,
        gnome_mode: gnomeMode,
      });

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDebugCall = (e: React.FormEvent) => {
    e.preventDefault();

    const initialOffsetSeconds = 145;
    const startedAtIso = new Date(Date.now() - initialOffsetSeconds * 1000).toISOString();

    const newCall: CallSessionSummary = {
      id: `call-debug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      scammer_number: debugScammerNumber.trim() || "+1 (555) 000-0000",
      region: debugRegion.trim() || "Unknown Region",
      country: debugCountry.trim() || "USA",
      gnome_number: debugGnomeNumber.trim() || "+1 (800) 420-GNOM",
      gnome_name: debugGnomeName.trim() || "Gnome Barnaby",
      started_at: startedAtIso,
      ended_at: null,
      duration_seconds: initialOffsetSeconds,
      status: "active",
    };

    // Generate sample debug call details with sample transcript and gnome lore
    const fullDetail = createSampleDebugCallDetail(newCall);

    if (typeof window !== "undefined") {
      try {
        const storedDetails = JSON.parse(
          window.localStorage.getItem("gnome_debug_call_details") || "{}"
        );
        storedDetails[newCall.id] = fullDetail;
        window.localStorage.setItem(
          "gnome_debug_call_details",
          JSON.stringify(storedDetails)
        );

        const storedCalls: CallSessionSummary[] = JSON.parse(
          window.localStorage.getItem("gnome_debug_calls") || "[]"
        );
        const updatedCalls = [newCall, ...storedCalls.filter((c) => c.id !== newCall.id)];
        window.localStorage.setItem(
          "gnome_debug_calls",
          JSON.stringify(updatedCalls)
        );

        window.dispatchEvent(new Event("gnome_calls_updated"));
      } catch {
        // Fallback
      }
    }

    if (onAddDebugCall) {
      onAddDebugCall(newCall);
    }

    notify.success(
      "Active Session Created",
      `Added debug call for ${newCall.scammer_number} (${newCall.gnome_name}).`
    );
  };

  const handleModalClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setErrorMessage(null);
      setRestPingState({ status: "idle" });
      setWsPingState({ status: "idle" });
      setIsThemeDropdownOpen(false);
      setIsDropdownClosing(false);
      setIsClosing(false);
      onClose();
    }, 160);
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div
      onClick={handleModalClose}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] ${
        isClosing ? "animate-overlay-fade-out" : "animate-overlay-fade"
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[620px] max-h-[95vh] ${
          isClosing ? "animate-dialog-zoom-out" : "animate-dialog-zoom"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-zinc-100">Settings</h3>
          </div>
          <button
            onClick={handleModalClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all hover:scale-105 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/30 px-6 gap-6">
          <button
            onClick={() => setActiveTab("frontend")}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${
              activeTab === "frontend"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Palette className="w-4 h-4" />
            Frontend
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${
              activeTab === "system"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Server className="w-4 h-4" />
            Backend
          </button>
          <button
            onClick={() => setActiveTab("debug")}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${
              activeTab === "debug"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bug className="w-4 h-4" />
            Debug Tools
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-0 flex-1">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-red-950/40 border border-red-800/60 text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {savedSuccess && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Settings updated successfully.</span>
            </div>
          )}

          {/* TAB 1: FRONTEND (APPEARANCE & AUDIO) */}
          {activeTab === "frontend" && (
            <div className="space-y-6">
              {/* Appearance / Theme Settings */}
              <div className="space-y-3" ref={themeDropdownRef}>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Appearance
                </h4>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  Customize the visual appearance, color palette, and theme of the management console.
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Theme
                  </label>

                  {/* Dropdown Menu Container */}
                  <div className="relative">
                    {/* Dropdown Trigger */}
                    <button
                      type="button"
                      onClick={toggleThemeDropdown}
                      className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-zinc-100 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:border-emerald-500/80"
                    >
                      {/* Left: Theme Name + Badge */}
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100 text-sm">
                          {currentOption.name}
                        </span>
                        {currentOption.badge && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {currentOption.badge}
                          </span>
                        )}
                      </div>

                      {/* Right: Swatches + Chevron */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          {currentOption.swatches.map((color, idx) => (
                            <span
                              key={idx}
                              className="w-4 h-4 rounded border border-white/25 shadow-xs shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                            isThemeDropdownOpen ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </button>

                    {/* Dropdown Options List */}
                    {(isThemeDropdownOpen || isDropdownClosing) && (
                      <div
                        className={`absolute top-full left-0 right-0 mt-1.5 z-40 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden py-1 divide-y divide-zinc-900 ${
                          isDropdownClosing
                            ? "animate-dropdown-zoom-out"
                            : "animate-dropdown-zoom"
                        }`}
                      >
                        {THEME_OPTIONS.map((opt) => {
                          const isSelected = theme === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setTheme(opt.id);
                                closeThemeDropdown();
                              }}
                              className={`w-full px-4 py-3 flex items-center justify-between text-xs transition-colors hover:bg-zinc-900 text-left ${
                                isSelected
                                  ? "bg-zinc-900/80 text-emerald-400 font-semibold"
                                  : "text-zinc-200"
                              }`}
                            >
                              {/* Left: Theme Name + Badge */}
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-sm ${
                                    isSelected ? "text-emerald-400 font-bold" : "text-zinc-200"
                                  }`}
                                >
                                  {opt.name}
                                </span>
                                {opt.badge && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                                    {opt.badge}
                                  </span>
                                )}
                              </div>

                              {/* Right: Swatches */}
                              <div className="flex items-center gap-1.5">
                                {opt.swatches.map((color, idx) => (
                                  <span
                                    key={idx}
                                    className="w-4 h-4 rounded border border-white/25 shadow-xs shrink-0"
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Hide All Numbers Toggle */}
                <div className="pt-1">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                    <div>
                      <label className="text-xs font-semibold text-zinc-200">
                        Hide All Numbers
                      </label>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Obfuscate digits using asterisks, keeping only the country code and last 4 digits.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                      <input
                        type="checkbox"
                        checked={hideNumbers}
                        onChange={(e) => handleToggleHideNumbers(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Recorded Audio Playback Configuration */}
              <div className="space-y-3 pt-3 border-t border-zinc-800/80">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Audio Playback
                </h4>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  Select how audio streams from call sessions are unpacked and played back.
                </p>

                <div className="space-y-3 pt-1">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Playback Mode
                  </label>

                  {/* Option 1: Stereo */}
                  <div
                    onClick={() => handlePlaybackModeChange("stereo")}
                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] ${
                      playbackMode === "stereo"
                        ? "bg-emerald-950/20 border-emerald-500/80 shadow-xs"
                        : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                            playbackMode === "stereo"
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-zinc-600 bg-transparent"
                          }`}
                        >
                          {playbackMode === "stereo" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-100">
                              Stereo (2-Channel)
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Default
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            Plays call audio in a modern 2-channel stereo configuration. Audio is played as is: the caller audio is routed to the left channel, while the gnome audio is routed to the right channel. Ideal for headphones.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Mono */}
                  <div
                    onClick={() => handlePlaybackModeChange("mono")}
                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] ${
                      playbackMode === "mono"
                        ? "bg-emerald-950/20 border-emerald-500/80 shadow-xs"
                        : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                            playbackMode === "mono"
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-zinc-600 bg-transparent"
                          }`}
                        >
                          {playbackMode === "mono" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-100">
                              Mono (1-Channel)
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            Plays call audio in a traditional 1-channel mono configuration. Audio is unpacked: both caller and gnome audio are played on the same channel.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950/40 border border-zinc-800/60 flex items-center gap-3 mt-2">
                  <Volume2 className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="text-[11px] text-zinc-400 leading-relaxed">
                    Current playback mode: <span className="font-semibold text-zinc-200 capitalize">{playbackMode}</span>. Changes take effect on subsequent playback starts.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BACKEND */}
          {activeTab === "system" && (
            <div className="space-y-5">
              {/* Connection Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Connection Settings
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      handlePingRest();
                      handlePingWs();
                    }}
                    disabled={restPingState.status === "pinging" || wsPingState.status === "pinging"}
                    className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50 flex items-center gap-1 transition-colors hover:scale-105 active:scale-95 disabled:hover:scale-100"
                  >
                    <Activity className="w-3 h-3" />
                    Test Backend
                  </button>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  Configure API and WebSocket endpoints used to communicate with the backend service.
                </p>

                {/* REST URL + Ping */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-300">
                      Gnome Backend REST URL
                    </label>
                    {restPingState.status === "success" && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        {restPingState.latency}ms
                      </span>
                    )}
                    {restPingState.status === "error" && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Offline
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={backendUrl}
                      onChange={(e) => {
                        setBackendUrl(e.target.value);
                        setRestPingState({ status: "idle" });
                      }}
                      placeholder="https://api.gnomegrove.tech"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80"
                    />
                    <button
                      type="button"
                      onClick={handlePingRest}
                      disabled={restPingState.status === "pinging"}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {restPingState.status === "pinging" ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                      ) : (
                        <Activity className="w-3 h-3 text-emerald-400" />
                      )}
                      Test
                    </button>
                  </div>
                  {restPingState.message && (
                    <p
                      className={`text-[11px] mt-1 ${
                        restPingState.status === "error" ? "text-red-400" : "text-emerald-400/80"
                      }`}
                    >
                      {restPingState.message}
                    </p>
                  )}
                </div>

                {/* WebSocket URL + Ping */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-300">
                      Gnome Backend WebSocket Base URL
                    </label>
                    {wsPingState.status === "success" && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        {wsPingState.latency}ms
                      </span>
                    )}
                    {wsPingState.status === "error" && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Offline
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={wsUrl}
                      onChange={(e) => {
                        setWsUrl(e.target.value);
                        setWsPingState({ status: "idle" });
                      }}
                      placeholder="wss://api.gnomegrove.tech"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80"
                    />
                    <button
                      type="button"
                      onClick={handlePingWs}
                      disabled={wsPingState.status === "pinging"}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {wsPingState.status === "pinging" ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                      ) : (
                        <Activity className="w-3 h-3 text-emerald-400" />
                      )}
                      Test
                    </button>
                  </div>
                  {wsPingState.message && (
                    <p
                      className={`text-[11px] mt-1 ${
                        wsPingState.status === "error" ? "text-red-400" : "text-emerald-400/80"
                      }`}
                    >
                      {wsPingState.message}
                    </p>
                  )}
                </div>
              </div>

              {/* AI & Engine Parameters */}
              <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Engine Parameters
                </h4>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  Tune counter-scamming AI behavior, aggression levels, and call handling limits.
                </p>

                {/* Aggression Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-300">
                      Aggression Level
                    </label>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Level {aggression}: {
                        aggression === 1
                          ? "Gullible & Slow"
                          : aggression === 2
                          ? "Cautious"
                          : aggression === 3
                          ? "Playful Troll"
                          : aggression === 4
                          ? "Distracting & Absurd"
                          : "Maximum Chaos"
                      }
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={aggression}
                    onChange={(e) => setAggression(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                    <span>1 (Mild)</span>
                    <span>3 (Balanced)</span>
                    <span>5 (Total Chaos)</span>
                  </div>
                </div>

                {/* Dynamic Gnome Generation Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <span className="block text-xs font-medium text-zinc-200">
                        Dynamic Gnome Generation
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          generateNewGnome
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        }`}
                      >
                        {generateNewGnome ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <span className="block text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                      When enabled, a distinct backstory and profile will be synthesized for each inbound call.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={generateNewGnome}
                      onChange={(e) => setGenerateNewGnome(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                  </label>
                </div>

                {/* Whimsy Mode Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <span className="block text-xs font-medium text-zinc-200">
                        Whimsy Mode
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          gnomeMode === "whimsy"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        }`}
                      >
                        {gnomeMode === "whimsy" ? "Enabled (Friendly)" : "Disabled (Aggressive)"}
                      </span>
                    </div>
                    <span className="block text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                      When enabled, the gnome no longer attacks scammers and acts for fun.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={gnomeMode === "whimsy"}
                      onChange={(e) => handleToggleGnomeMode(e.target.checked)}
                      disabled={isUpdatingMode}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                  </label>
                </div>

                {/* Default Personality Archetype */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Default Personality Archetype / Prompt
                  </label>
                  <textarea
                    rows={2}
                    value={defaultPersonality}
                    onChange={(e) => setDefaultPersonality(e.target.value)}
                    placeholder="e.g. A retired eccentric watchmaker who believes callers are lawn maintenance elves."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/80 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Max Call Duration (Seconds)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={7200}
                    value={autoTerminateSeconds}
                    onChange={(e) => setAutoTerminateSeconds(Number(e.target.value))}
                    placeholder="1800"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveSystemSettings}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100 disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Save Server Settings
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DEBUG TOOLS */}
          {activeTab === "debug" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Call Simulation
                </h4>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  Injects a simulated active call session to preview call functionality.
                </p>

                <div className="space-y-3 pt-1">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Session Injection
                  </label>

                  <form onSubmit={handleCreateDebugCall} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Scammer&apos;s Number
                    </label>
                    <input
                      type="text"
                      required
                      value={debugScammerNumber}
                      onChange={(e) => setDebugScammerNumber(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Region
                    </label>
                    <input
                      type="text"
                      required
                      value={debugRegion}
                      onChange={(e) => setDebugRegion(e.target.value)}
                      placeholder="e.g. Dallas, TX"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/80"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Country (ISO-3)
                    </label>
                    <input
                      type="text"
                      required
                      value={debugCountry}
                      onChange={(e) => setDebugCountry(e.target.value)}
                      placeholder="e.g. USA"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 uppercase focus:outline-none focus:border-emerald-500/80"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Gnome&apos;s Virtual Number
                    </label>
                    <input
                      type="text"
                      required
                      value={debugGnomeNumber}
                      onChange={(e) => setDebugGnomeNumber(e.target.value)}
                      placeholder="+1 (800) 420-GNOM"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/80"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Assigned Gnome Name
                    </label>
                    <input
                      type="text"
                      required
                      value={debugGnomeName}
                      onChange={(e) => setDebugGnomeName(e.target.value)}
                      placeholder="e.g. Barnaby"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/80"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all hover:scale-105 active:scale-95"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Add Active Call Session (Preview)
                  </button>
                </div>
                </form>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-950/60">
          <button
            onClick={handleModalClose}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-all hover:scale-105 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
