"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getWsBaseUrl } from "../lib/api";
import { useBackendUrlVersion } from "./useBackendUrlVersion";

interface UseOverlappedAudioOptions {
  callId: string;
  wsBaseUrl?: string;
  autoPlay?: boolean;
}

type Channel = "user" | "gnome";
type WsStatus = "idle" | "connecting" | "open" | "closed" | "error";

// Small lead so the first chunk after a gap doesn't start in the past and get clipped
const START_LEAD_S = 0.08;
// Caller audio arrives in real time; anything queued further ahead than this is stale lag
// (e.g. after a tab was in the background), so drop it to stay live.
// Gnome audio arrives in bursts faster than real time, so it's allowed to queue up much further.
const MAX_QUEUE_AHEAD_S: Record<Channel, number> = { user: 1.0, gnome: 30 };
const MAX_RECONNECTS = 5;

export function useOverlappedAudio({
  callId,
  wsBaseUrl,
  autoPlay = true,
}: UseOverlappedAudioOptions) {
  const [isMuted, setIsMuted] = useState(true);
  const [userVolume, setUserVolumeState] = useState(0.85);
  const [gnomeVolume, setGnomeVolumeState] = useState(0.85);

  const [userLevel, setUserLevel] = useState(0);
  const [gnomeLevel, setGnomeLevel] = useState(0);

  const [userWsStatus, setUserWsStatus] = useState<WsStatus>(callId ? "connecting" : "idle");
  const [gnomeWsStatus, setGnomeWsStatus] = useState<WsStatus>(callId ? "connecting" : "idle");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const userGainRef = useRef<GainNode | null>(null);
  const gnomeGainRef = useRef<GainNode | null>(null);
  const userAnalyserRef = useRef<AnalyserNode | null>(null);
  const gnomeAnalyserRef = useRef<AnalyserNode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isMutedRef = useRef(isMuted);
  const userVolumeRef = useRef(userVolume);
  const gnomeVolumeRef = useRef(gnomeVolume);
  const nextPlayTimesRef = useRef<Record<Channel, number>>({ user: 0, gnome: 0 });

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    userVolumeRef.current = userVolume;
  }, [userVolume]);

  useEffect(() => {
    gnomeVolumeRef.current = gnomeVolume;
  }, [gnomeVolume]);

  const getWsHost = useCallback(() => wsBaseUrl || getWsBaseUrl(), [wsBaseUrl]);
  const urlVersion = useBackendUrlVersion(); // reconnect when Settings change the backend URL

  // Create (or resume) the Web Audio graph. Browsers only let audio start from a user gesture,
  // so this must be called from a click handler (the "Start Stream" button), never from a socket message.
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();

      const uGain = ctx.createGain();
      const gGain = ctx.createGain();
      const uAnalyser = ctx.createAnalyser();
      const gAnalyser = ctx.createAnalyser();

      uAnalyser.fftSize = 64;
      gAnalyser.fftSize = 64;

      // Independent chains: Analyser -> Gain -> Destination
      uAnalyser.connect(uGain);
      uGain.connect(ctx.destination);

      gAnalyser.connect(gGain);
      gGain.connect(ctx.destination);

      uGain.gain.value = isMutedRef.current ? 0 : userVolumeRef.current;
      gGain.gain.value = isMutedRef.current ? 0 : gnomeVolumeRef.current;

      audioCtxRef.current = ctx;
      userGainRef.current = uGain;
      gnomeGainRef.current = gGain;
      userAnalyserRef.current = uAnalyser;
      gnomeAnalyserRef.current = gAnalyser;
    }

    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Play raw 16-bit little-endian PCM mono audio (8 kHz from the backend) on one channel
  const playPcm16Chunk = useCallback((channel: Channel, pcmBase64: string, sampleRate = 8000) => {
    const ctx = audioCtxRef.current;
    // Not listening yet, or muted: drop live audio instead of queueing it to play late
    if (!ctx || ctx.state !== "running" || isMutedRef.current) return;

    try {
      const binary = atob(pcmBase64);
      const sampleCount = Math.floor(binary.length / 2);
      if (sampleCount === 0) return;

      // Decode 16-bit signed integer samples safely without alignment issues
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const lo = binary.charCodeAt(i * 2);
        const hi = binary.charCodeAt(i * 2 + 1);
        let val = (hi << 8) | lo;
        if (val >= 0x8000) val -= 0x10000;
        float32[i] = val / 32768.0;
      }

      const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
      buffer.getChannelData(0).set(float32);

      const now = ctx.currentTime;
      const queued = nextPlayTimesRef.current[channel];
      // Fell behind (gap in the stream): restart just ahead of now. Too far ahead: drop to stay live.
      const startAt = queued < now ? now + START_LEAD_S : queued;
      if (startAt - now > MAX_QUEUE_AHEAD_S[channel]) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const targetAnalyser = channel === "user" ? userAnalyserRef.current : gnomeAnalyserRef.current;
      source.connect(targetAnalyser ?? ctx.destination);
      source.start(startAt);
      nextPlayTimesRef.current[channel] = startAt + buffer.duration;
    } catch {
      // Ignored
    }
  }, []);

  // Volume & Mute synchronizers
  const setUserVolume = useCallback((val: number) => {
    setUserVolumeState(val);
    if (userGainRef.current && !isMutedRef.current) {
      userGainRef.current.gain.value = val;
    }
  }, []);

  const setGnomeVolume = useCallback((val: number) => {
    setGnomeVolumeState(val);
    if (gnomeGainRef.current && !isMutedRef.current) {
      gnomeGainRef.current.gain.value = val;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    if (!next) {
      // Unmuting is a click, so the browser allows audio to start here
      ensureAudioContext();
      nextPlayTimesRef.current = { user: 0, gnome: 0 };
    }
    if (userGainRef.current) {
      userGainRef.current.gain.value = next ? 0 : userVolumeRef.current;
    }
    if (gnomeGainRef.current) {
      gnomeGainRef.current.gain.value = next ? 0 : gnomeVolumeRef.current;
    }
  }, [ensureAudioContext]);

  // Live feed: /ws/live/{callId} carries both audio.caller and audio.gnome (plus transcript/telemetry)
  useEffect(() => {
    if (!callId || !autoPlay) return;

    const liveWsUrl = `${getWsHost()}/ws/live/${callId}`;
    let disposed = false;
    let reconnects = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const setStatus = (s: WsStatus) => {
      setUserWsStatus(s);
      setGnomeWsStatus(s);
    };

    const connect = () => {
      setStatus("connecting");
      const ws = new WebSocket(liveWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnects = 0;
        setStatus("open");
      };
      ws.onerror = () => setStatus("error");
      ws.onclose = (e) => {
        if (disposed) return;
        // 1008 = backend says this call isn't active (ended or unknown id): don't retry
        if (e.code === 1008 || reconnects >= MAX_RECONNECTS) {
          setStatus(e.code === 1008 ? "closed" : "error");
          return;
        }
        reconnects += 1;
        setStatus("connecting");
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** (reconnects - 1), 8000));
      };

      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        try {
          const payload = JSON.parse(e.data);
          const data = payload.data || payload;
          if (payload.type === "audio.caller" && data.pcm16) {
            playPcm16Chunk("user", data.pcm16, data.sample_rate || 8000);
          } else if (payload.type === "audio.gnome" && data.pcm16) {
            playPcm16Chunk("gnome", data.pcm16, data.sample_rate || 8000);
          } else if (payload.type === "call.ended") {
            disposed = true; // call is over; the backend will close the socket, no reconnect
          }
        } catch {
          // Ignored
        }
      };
    };

    connect();

    // Level meter animation loop
    const updateLevels = () => {
      if (userAnalyserRef.current) {
        const uData = new Uint8Array(userAnalyserRef.current.frequencyBinCount);
        userAnalyserRef.current.getByteFrequencyData(uData);
        let uSum = 0;
        for (let i = 0; i < uData.length; i++) uSum += uData[i];
        setUserLevel(Math.min(100, Math.round((uSum / uData.length / 255) * 100)));
      }

      if (gnomeAnalyserRef.current) {
        const gData = new Uint8Array(gnomeAnalyserRef.current.frequencyBinCount);
        gnomeAnalyserRef.current.getByteFrequencyData(gData);
        let gSum = 0;
        for (let i = 0; i < gData.length; i++) gSum += gData[i];
        setGnomeLevel(Math.min(100, Math.round((gSum / gData.length / 255) * 100)));
      }

      animFrameRef.current = requestAnimationFrame(updateLevels);
    };

    animFrameRef.current = requestAnimationFrame(updateLevels);

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [callId, autoPlay, getWsHost, playPcm16Chunk, urlVersion]);

  // Release the audio device when leaving the page. With cacheComponents the page may only be
  // hidden (state survives), so also go back to muted so a return requires a fresh "Start Stream".
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      isMutedRef.current = true;
      setIsMuted(true);
    };
  }, []);

  return {
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
  };
}
