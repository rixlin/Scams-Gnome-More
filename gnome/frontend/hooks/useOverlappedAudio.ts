"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseOverlappedAudioOptions {
  callId: string;
  wsBaseUrl?: string;
  autoPlay?: boolean;
}

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

  const [userWsStatus, setUserWsStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">(
    callId ? "connecting" : "idle"
  );
  const [gnomeWsStatus, setGnomeWsStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">(
    callId ? "connecting" : "idle"
  );

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
  const nextPlayTimesRef = useRef<{ user: number; gnome: number }>({ user: 0, gnome: 0 });

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    userVolumeRef.current = userVolume;
  }, [userVolume]);

  useEffect(() => {
    gnomeVolumeRef.current = gnomeVolume;
  }, [gnomeVolume]);

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

  // Initialize Web Audio Context and separate signal paths
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

  // Play raw 16-bit PCM mono audio chunk (8kHz) into a specific channel
  const playPcm16Chunk = useCallback(
    (channel: "user" | "gnome", pcmBase64: string, sampleRate = 8000) => {
      const ctx = ensureAudioContext();
      if (!ctx) return;

      try {
        const binary = atob(pcmBase64);
        const len = binary.length;
        const sampleCount = Math.floor(len / 2);
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

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const targetAnalyser =
          channel === "user" ? userAnalyserRef.current : gnomeAnalyserRef.current;
        if (targetAnalyser) {
          source.connect(targetAnalyser);
        } else {
          source.connect(ctx.destination);
        }

        // Schedule seamlessly ahead of current time to avoid overlapping jitter
        const now = ctx.currentTime;
        const nextTime = Math.max(now, nextPlayTimesRef.current[channel]);
        source.start(nextTime);
        nextPlayTimesRef.current[channel] = nextTime + buffer.duration;
      } catch {
        // Ignored
      }
    },
    [ensureAudioContext]
  );

  const playPcm16ChunkRef = useRef(playPcm16Chunk);
  useEffect(() => {
    playPcm16ChunkRef.current = playPcm16Chunk;
  }, [playPcm16Chunk]);

  // Volume & Mute synchronizers
  const setUserVolume = useCallback(
    (val: number) => {
      setUserVolumeState(val);
      if (userGainRef.current && !isMutedRef.current) {
        userGainRef.current.gain.value = val;
      }
    },
    []
  );

  const setGnomeVolume = useCallback(
    (val: number) => {
      setGnomeVolumeState(val);
      if (gnomeGainRef.current && !isMutedRef.current) {
        gnomeGainRef.current.gain.value = val;
      }
    },
    []
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (userGainRef.current) {
        userGainRef.current.gain.value = next ? 0 : userVolumeRef.current;
      }
      if (gnomeGainRef.current) {
        gnomeGainRef.current.gain.value = next ? 0 : gnomeVolumeRef.current;
      }
      return next;
    });
  }, []);

  // Setup WebSocket connection to /ws/live/{callId}
  useEffect(() => {
    if (!callId || !autoPlay) return;

    const baseHost = getWsHost();
    const liveWsUrl = `${baseHost}/ws/live/${callId}`;

    const ws = new WebSocket(liveWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setUserWsStatus("open");
      setGnomeWsStatus("open");
    };
    ws.onclose = () => {
      setUserWsStatus("closed");
      setGnomeWsStatus("closed");
    };
    ws.onerror = () => {
      setUserWsStatus("error");
      setGnomeWsStatus("error");
    };

    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const payload = JSON.parse(e.data);
          const type = payload.type;
          const data = payload.data || payload;

          if (type === "audio.caller" && data.pcm16) {
            playPcm16ChunkRef.current("user", data.pcm16, data.sample_rate || 8000);
          } else if (type === "audio.gnome" && data.pcm16) {
            playPcm16ChunkRef.current("gnome", data.pcm16, data.sample_rate || 8000);
          }
        } catch {
          // Ignored
        }
      }
    };

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
      ws.close();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [callId, autoPlay, getWsHost]);

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
