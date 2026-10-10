import {
  CallSessionSummary,
  CallSessionDetail,
  LiveGnomeUpdateRequest,
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

export async function fetchCallSessions(): Promise<CallSessionSummary[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/calls`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch calls: ${res.statusText}`);
  }
  return res.json();
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
      return res.json();
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
  // Clean up from local debug storage if present
  if (typeof window !== "undefined") {
    try {
      const storedDetails = JSON.parse(
        window.localStorage.getItem("gnome_debug_call_details") || "{}"
      );
      if (storedDetails[id]) {
        delete storedDetails[id];
        window.localStorage.setItem(
          "gnome_debug_call_details",
          JSON.stringify(storedDetails)
        );
      }
      const storedCalls: CallSessionSummary[] = JSON.parse(
        window.localStorage.getItem("gnome_debug_calls") || "[]"
      );
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
  const res = await fetch(`${baseUrl}/api/settings`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch settings: ${res.statusText}`);
  }
  return res.json();
}

export async function updateSettings(
  settings: Partial<SystemSettings>
): Promise<{ success: boolean }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error(`Failed to update settings: ${res.statusText}`);
  }
  return res.json();
}
