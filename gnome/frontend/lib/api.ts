import {
  CallSessionSummary,
  CallSessionDetail,
  GnomeState,
  LiveGnomeUpdateRequest,
  PingResult,
  SystemSettings,
  TranscriptTurn,
} from "./types";

const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      window.localStorage.getItem("gnome_backend_url") ||
      "http://localhost:8000"
    );
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
};

export async function checkBackendHealth(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    }).catch(async () => {
      return await fetch(`${baseUrl}/api/health`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchCallSessions(): Promise<CallSessionSummary[]> {
  const baseUrl = getBaseUrl();

  // Fetch active calls and history concurrently
  const [activeRes, historyRes] = await Promise.allSettled([
    fetch(`${baseUrl}/api/calls/active`, { cache: "no-store" }),
    fetch(`${baseUrl}/api/calls`, { cache: "no-store" }),
  ]);

  const activeCalls: CallSessionSummary[] = [];
  if (activeRes.status === "fulfilled" && activeRes.value.ok) {
    try {
      const activeData = await activeRes.value.json();
      for (const c of activeData) {
        activeCalls.push({
          id: c.call_id || c.id,
          call_id: c.call_id || c.id,
          scammer_number: c.scammer_number || c.caller_number || "Unknown Scammer",
          caller_number: c.caller_number,
          region: c.region || "Toll Free",
          country: c.country || "USA",
          gnome_number: c.gnome_number || "+1 (800) 420-GNOM",
          gnome_name: c.gnome_name || c.gnome?.name || "Assigned Gnome",
          started_at:
            c.started_at ||
            new Date(Date.now() - (c.elapsed_s || 0) * 1000).toISOString(),
          ended_at: null,
          duration_seconds: Math.round(c.elapsed_s || c.duration_seconds || 0),
          status: "active",
        });
      }
    } catch {
      // Ignored
    }
  }

  const historyCalls: CallSessionSummary[] = [];
  if (historyRes.status === "fulfilled" && historyRes.value.ok) {
    try {
      const historyData = await historyRes.value.json();
      for (const c of historyData) {
        historyCalls.push({
          id: c.id,
          scammer_number: c.scammer_number || c.caller_number || "Unknown Scammer",
          caller_number: c.caller_number,
          region: c.region || "Toll Free",
          country: c.country || "USA",
          gnome_number: c.gnome_number || "+1 (800) 420-GNOM",
          gnome_name: c.gnome_name || "Assigned Gnome",
          started_at: c.started_at,
          ended_at: c.ended_at,
          duration_seconds: c.duration_seconds || c.duration_s || 0,
          status: c.status || (c.ended_at ? "ended" : "active"),
          recording_url: c.has_audio ? `${baseUrl}/api/calls/${c.id}/audio` : c.recording_url || null,
          recording_status: c.has_audio ? "available" : c.recording_status || "unavailable",
          has_audio: c.has_audio,
        });
      }
    } catch {
      // Ignored
    }
  }

  // Combine active calls (in front) with history calls, deduplicating by ID
  const combined = [...activeCalls];
  for (const h of historyCalls) {
    if (!combined.some((a) => a.id === h.id)) {
      combined.push(h);
    }
  }
  return combined;
}

export async function fetchCallDetail(id: string): Promise<CallSessionDetail> {
  // Check local debug storage first for local preview sessions
  if (typeof window !== "undefined") {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("gnome_debug_call_details") || "{}"
      );
      if (stored[id]) {
        return stored[id];
      }
    } catch {
      // Continue to network fetch
    }
  }

  const baseUrl = getBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/calls/${id}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const rawTurns = (data.transcript || data.utterances || []) as Array<Record<string, unknown>>;
      const mappedTurns: TranscriptTurn[] = rawTurns.map((u, idx: number) => ({
        id: (u.id as string) || `turn-${(u.seq as number) ?? idx}`,
        speaker: (u.speaker === "caller" ? "user" : (u.speaker as "user" | "gnome" | "operator")),
        text: (u.text as string) || "",
        timestamp: (u.ts as string) || (u.timestamp as string) || new Date().toISOString(),
        in_call_time: u.in_call_time as string | undefined,
        state_history: u.state_history as GnomeState[] | undefined,
        feedback_cue: u.feedback_cue as string | undefined,
        seq: (u.seq as number) ?? idx,
        final: (u.final as boolean) ?? true,
      }));

      const hasAudio = data.has_audio ?? false;
      const detail: CallSessionDetail = {
        id: data.id,
        scammer_number: data.scammer_number || data.caller_number || "Unknown Scammer",
        region: data.region || "Toll Free",
        country: data.country || "USA",
        gnome_number: data.gnome_number || "+1 (800) 420-GNOM",
        gnome: {
          name: data.gnome?.name || data.gnome_name || "Assigned Gnome",
          personality:
            typeof data.gnome?.personality === "string"
              ? data.gnome.personality
              : (data.gnome?.personality?.override ||
                 data.gnome?.personality?.traits?.join(", ") ||
                 "Garden gnome counter-scammer"),
          backstory: data.gnome?.backstory || "Guardian of the lawn and caller of spammers.",
        },
        started_at: data.started_at,
        ended_at: data.ended_at,
        duration_seconds: data.duration_seconds || data.duration_s || 0,
        status: data.status || (data.ended_at ? "ended" : "active"),
        recording_url: hasAudio ? `${baseUrl}/api/calls/${id}/audio` : data.recording_url || null,
        recording_status: hasAudio ? "available" : data.recording_status || "unavailable",
        has_audio: hasAudio,
        transcript: mappedTurns,
      };
      return detail;
    }
  } catch {
    // Backend may be offline
  }

  // Fallback to local storage if available
  if (typeof window !== "undefined") {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("gnome_debug_call_details") || "{}"
      );
      if (stored[id]) {
        return stored[id];
      }
    } catch {
      // Ignored
    }
  }

  throw new Error(`Call session ${id} not found.`);
}

export async function terminateCall(
  id: string,
  reason: string = "operator_terminated"
): Promise<{ success: boolean; message?: string }> {
  // Update local debug sessions if applicable
  if (typeof window !== "undefined") {
    try {
      const nowIso = new Date().toISOString();
      const storedDetails = JSON.parse(
        window.localStorage.getItem("gnome_debug_call_details") || "{}"
      );
      if (storedDetails[id]) {
        storedDetails[id].status = "ended";
        storedDetails[id].ended_at = nowIso;
        const startMs = new Date(storedDetails[id].started_at).getTime();
        storedDetails[id].duration_seconds = Math.max(
          1,
          Math.floor((Date.now() - startMs) / 1000)
        );
        window.localStorage.setItem(
          "gnome_debug_call_details",
          JSON.stringify(storedDetails)
        );
      }
      const storedCalls: CallSessionSummary[] = JSON.parse(
        window.localStorage.getItem("gnome_debug_calls") || "[]"
      );
      const updatedCalls = storedCalls.map((c) => {
        if (c.id === id) {
          const startMs = new Date(c.started_at).getTime();
          const dur = Math.max(1, Math.floor((Date.now() - startMs) / 1000));
          return {
            ...c,
            status: "ended" as const,
            ended_at: nowIso,
            duration_seconds: dur,
          };
        }
        return c;
      });
      window.localStorage.setItem(
        "gnome_debug_calls",
        JSON.stringify(updatedCalls)
      );

      // Record in terminated overrides map so real or debug calls reflect as ended across all pages
      const terminatedMap = JSON.parse(
        window.localStorage.getItem("gnome_terminated_calls") || "{}"
      );
      const startMs = storedDetails[id]
        ? new Date(storedDetails[id].started_at).getTime()
        : Date.now();
      const dur = Math.max(1, Math.floor((Date.now() - startMs) / 1000));
      terminatedMap[id] = {
        status: "ended",
        ended_at: nowIso,
        duration_seconds: dur,
      };
      window.localStorage.setItem(
        "gnome_terminated_calls",
        JSON.stringify(terminatedMap)
      );

      window.dispatchEvent(new Event("gnome_calls_updated"));
      if (storedDetails[id] || id.startsWith("call-debug")) {
        return { success: true };
      }
    } catch {
      // Continue to API
    }
  }

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/calls/${id}/terminate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    throw new Error(`Failed to terminate call ${id}: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteCall(
  id: string
): Promise<{ success: boolean; message?: string }> {
  // Disallow deleting active calls
  if (typeof window !== "undefined") {
    try {
      const storedCalls: CallSessionSummary[] = JSON.parse(
        window.localStorage.getItem("gnome_debug_calls") || "[]"
      );
      const targetCall = storedCalls.find((c) => c.id === id);
      if (targetCall && targetCall.status === "active") {
        throw new Error("Active calls cannot be deleted. The call must be ended before deleting.");
      }

      const storedDetails = JSON.parse(
        window.localStorage.getItem("gnome_debug_call_details") || "{}"
      );
      if (storedDetails[id] && storedDetails[id].status === "active") {
        throw new Error("Active calls cannot be deleted. The call must be ended before deleting.");
      }

      if (storedDetails[id]) {
        delete storedDetails[id];
        window.localStorage.setItem(
          "gnome_debug_call_details",
          JSON.stringify(storedDetails)
        );
      }
      const remainingCalls = storedCalls.filter((c) => c.id !== id);
      window.localStorage.setItem(
        "gnome_debug_calls",
        JSON.stringify(remainingCalls)
      );

      const terminatedMap = JSON.parse(
        window.localStorage.getItem("gnome_terminated_calls") || "{}"
      );
      if (terminatedMap[id]) {
        delete terminatedMap[id];
        window.localStorage.setItem(
          "gnome_terminated_calls",
          JSON.stringify(terminatedMap)
        );
      }

      window.dispatchEvent(new Event("gnome_calls_updated"));
      if (storedDetails[id] || id.startsWith("call-debug")) {
        return { success: true };
      }
    } catch {
      // Continue to API
    }
  }

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/calls/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete call ${id}: ${res.statusText}`);
  }
  return res.json();
}

export async function updateGnomeLive(
  id: string,
  update: LiveGnomeUpdateRequest
): Promise<{ success: boolean; message?: string }> {
  // Update local debug session if present
  if (typeof window !== "undefined") {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("gnome_debug_call_details") || "{}"
      );
      if (stored[id]) {
        if (update.personality) {
          stored[id].gnome.personality = update.personality;
        }
        if (update.feedback) {
          const newTurn: TranscriptTurn = {
            id: `turn-operator-${Date.now()}`,
            speaker: "operator",
            text: update.feedback,
            timestamp: new Date().toISOString(),
            in_call_time: "+live",
          };
          stored[id].transcript.push(newTurn);
        }
        window.localStorage.setItem(
          "gnome_debug_call_details",
          JSON.stringify(stored)
        );
        return { success: true, message: "Local debug session updated." };
      }
    } catch {
      // Continue to API
    }
  }

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/calls/${id}/gnome/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    throw new Error(`Failed to update gnome: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSettings(): Promise<SystemSettings> {
  const baseUrl = getBaseUrl();
  const defaultLocal: SystemSettings = {
    backend_api_url: baseUrl,
    backend_ws_url: baseUrl.replace(/^http/, "ws"),
    auto_terminate_seconds: 1800,
    aggression: 3,
    max_call_seconds: 1800,
    default_personality: "",
    voice_id: null,
    generate_new_gnome_per_call: true,
  };

  try {
    const res = await fetch(`${baseUrl}/api/settings`, {
      cache: "no-store",
    });
    if (res.ok) {
      const backendSettings = await res.json();
      return {
        ...defaultLocal,
        ...backendSettings,
        auto_terminate_seconds:
          backendSettings.max_call_seconds || defaultLocal.auto_terminate_seconds,
      };
    }
  } catch {
    // Return local defaults
  }
  return defaultLocal;
}

export async function updateSettings(
  settings: Partial<SystemSettings>
): Promise<{ success: boolean }> {
  const baseUrl = getBaseUrl();
  const backendPatch: Record<string, unknown> = {};

  if (settings.default_personality !== undefined) {
    backendPatch.default_personality = settings.default_personality;
  }
  if (settings.voice_id !== undefined) {
    backendPatch.voice_id = settings.voice_id;
  }
  if (settings.max_call_seconds !== undefined) {
    backendPatch.max_call_seconds = settings.max_call_seconds;
  } else if (settings.auto_terminate_seconds !== undefined) {
    backendPatch.max_call_seconds = settings.auto_terminate_seconds;
  }
  if (settings.generate_new_gnome_per_call !== undefined) {
    backendPatch.generate_new_gnome_per_call = settings.generate_new_gnome_per_call;
  }
  if (settings.fixed_gnome !== undefined) {
    backendPatch.fixed_gnome = settings.fixed_gnome;
  }
  if (settings.aggression !== undefined) {
    backendPatch.aggression = settings.aggression;
  }

  if (Object.keys(backendPatch).length > 0) {
    try {
      const res = await fetch(`${baseUrl}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backendPatch),
      });
      if (!res.ok) {
        console.warn(`Failed to update backend settings: ${res.statusText}`);
      }
    } catch (e) {
      console.warn("Could not save settings to backend server:", e);
    }
  }

  return { success: true };
}

export async function pingRest(targetUrl?: string): Promise<PingResult> {
  const url = (targetUrl || getBaseUrl()).trim().replace(/\/+$/, "");
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    // Try /api/ping first, fallback to /health or /api/health
    let res = await fetch(`${url}/api/ping`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`${url}/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      }).catch(() => null);
    }

    clearTimeout(timeoutId);

    const latencyMs = Math.max(1, Date.now() - startTime);
    if (res && res.ok) {
      return { ok: true, latencyMs, message: `Connected (${latencyMs}ms)` };
    }

    return {
      ok: false,
      latencyMs,
      message: res ? `HTTP ${res.status} ${res.statusText}` : "No response from server",
    };
  } catch (err: unknown) {
    const latencyMs = Math.max(1, Date.now() - startTime);
    const msg = err instanceof Error ? err.message : "Failed to reach REST endpoint";
    return { ok: false, latencyMs, message: msg };
  }
}

export async function pingWs(targetWsUrl?: string): Promise<PingResult> {
  let wsUrl = (targetWsUrl || getBaseUrl().replace(/^http/, "ws")).trim().replace(/\/+$/, "");
  if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
    wsUrl = `ws://${wsUrl}`;
  }

  const pingEndpoint = wsUrl.endsWith("/ws/ping")
    ? wsUrl
    : `${wsUrl}/ws/ping`;

  const startTime = Date.now();

  return new Promise<PingResult>((resolve) => {
    let resolved = false;
    let ws: WebSocket | null = null;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          ws?.close();
        } catch {}
        resolve({
          ok: false,
          latencyMs: Math.max(1, Date.now() - startTime),
          message: "WebSocket connection timed out (4s)",
        });
      }
    }, 4000);

    try {
      ws = new WebSocket(pingEndpoint);

      ws.onopen = () => {
        try {
          ws?.send(JSON.stringify({ type: "ping" }));
        } catch {}
      };

      ws.onmessage = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          const latencyMs = Math.max(1, Date.now() - startTime);
          try {
            ws?.close(1000);
          } catch {}
          resolve({
            ok: true,
            latencyMs,
            message: `Connected (${latencyMs}ms)`,
          });
        }
      };

      const openGrace = setTimeout(() => {
        if (!resolved && ws?.readyState === WebSocket.OPEN) {
          resolved = true;
          clearTimeout(timer);
          const latencyMs = Math.max(1, Date.now() - startTime);
          try {
            ws?.close(1000);
          } catch {}
          resolve({
            ok: true,
            latencyMs,
            message: `Connected (${latencyMs}ms)`,
          });
        }
      }, 600);

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          clearTimeout(openGrace);
          const latencyMs = Math.max(1, Date.now() - startTime);
          resolve({
            ok: false,
            latencyMs,
            message: "Failed to establish WebSocket connection",
          });
        }
      };

      ws.onclose = (event) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          clearTimeout(openGrace);
          const latencyMs = Math.max(1, Date.now() - startTime);
          if (event.code === 1000) {
            resolve({
              ok: true,
              latencyMs,
              message: `Connected (${latencyMs}ms)`,
            });
          } else {
            resolve({
              ok: false,
              latencyMs,
              message: `Closed with code ${event.code}${event.reason ? `: ${event.reason}` : ""}`,
            });
          }
        }
      };
    } catch (err: unknown) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        const latencyMs = Math.max(1, Date.now() - startTime);
        const msg = err instanceof Error ? err.message : "WebSocket error";
        resolve({ ok: false, latencyMs, message: msg });
      }
    }
  });
}

