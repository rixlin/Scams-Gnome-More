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

  const userWsRef = useRef<WebSocket | null>(null);
  const gnomeWsRef = useRef<WebSocket | null>(null);
  const animFrameRef = useRef<number | null>(null);

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
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

      uGain.gain.value = isMuted ? 0 : userVolume;
      gGain.gain.value = isMuted ? 0 : gnomeVolume;

      audioCtxRef.current = ctx;
      userGainRef.current = uGain;
      gnomeGainRef.current = gGain;
      userAnalyserRef.current = uAnalyser;
      gnomeAnalyserRef.current = gAnalyser;
    }

    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [isMuted, userVolume, gnomeVolume]);

  // Play audio buffer into a specific channel
  const playAudioChunk = useCallback(async (channel: "user" | "gnome", arrayBuffer: ArrayBuffer) => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    try {
      // Decode audio chunk (PCM, MP3, WAV, etc.)
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const targetAnalyser = channel === "user" ? userAnalyserRef.current : gnomeAnalyserRef.current;
      if (targetAnalyser) {
        source.connect(targetAnalyser);
      } else {
        source.connect(ctx.destination);
      }
      source.start();
    } catch {
      // Fallback: If decodeAudioData fails (e.g. raw PCM without headers), ignore or handle gracefully
    }
  }, [ensureAudioContext]);

  // Volume & Mute synchronizers
  const setUserVolume = useCallback((val: number) => {
    setUserVolumeState(val);
    if (userGainRef.current && !isMuted) {
      userGainRef.current.gain.value = val;
    }
  }, [isMuted]);

  const setGnomeVolume = useCallback((val: number) => {
    setGnomeVolumeState(val);
    if (gnomeGainRef.current && !isMuted) {
      gnomeGainRef.current.gain.value = val;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (userGainRef.current) {
        userGainRef.current.gain.value = next ? 0 : userVolume;
      }
      if (gnomeGainRef.current) {
        gnomeGainRef.current.gain.value = next ? 0 : gnomeVolume;
      }
      return next;
    });
  }, [userVolume, gnomeVolume]);

  // Setup WebSockets for both independent streams
  useEffect(() => {
    if (!callId || !autoPlay) return;

    const baseHost = getWsHost();
    const userWsUrl = `${baseHost}/ws/calls/${callId}/audio/user`;
    const gnomeWsUrl = `${baseHost}/ws/calls/${callId}/audio/gnome`;

    // Connect User audio WS
    const userWs = new WebSocket(userWsUrl);
    userWs.binaryType = "arraybuffer";
    userWsRef.current = userWs;

    userWs.onopen = () => setUserWsStatus("open");
    userWs.onclose = () => setUserWsStatus("closed");
    userWs.onerror = () => setUserWsStatus("error");
    userWs.onmessage = async (e) => {
      if (e.data instanceof ArrayBuffer) {
        playAudioChunk("user", e.data);
      } else if (typeof e.data === "string") {
        try {
          const parsed = JSON.parse(e.data);
          const b64 = parsed.audio || parsed.payload_base64;
          if (b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            playAudioChunk("user", bytes.buffer);
          }
        } catch {
          // Non-JSON string or ping
        }
      }
    };

    // Connect Gnome audio WS
    const gnomeWs = new WebSocket(gnomeWsUrl);
    gnomeWs.binaryType = "arraybuffer";
    gnomeWsRef.current = gnomeWs;

    gnomeWs.onopen = () => setGnomeWsStatus("open");
    gnomeWs.onclose = () => setGnomeWsStatus("closed");
    gnomeWs.onerror = () => setGnomeWsStatus("error");
    gnomeWs.onmessage = async (e) => {
      if (e.data instanceof ArrayBuffer) {
        playAudioChunk("gnome", e.data);
      } else if (typeof e.data === "string") {
        try {
          const parsed = JSON.parse(e.data);
          const b64 = parsed.audio || parsed.payload_base64;
          if (b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            playAudioChunk("gnome", bytes.buffer);
          }
        } catch {
          // Non-JSON string or ping
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
      if (userWs) userWs.close();
      if (gnomeWs) gnomeWs.close();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [callId, autoPlay, getWsHost, playAudioChunk]);

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
