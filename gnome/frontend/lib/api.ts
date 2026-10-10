import {
  CallSessionSummary,
  CallSessionDetail,
  LiveGnomeUpdateRequest,
  SystemSettings,
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
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/calls/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch call details for ${id}: ${res.statusText}`);
  }
  return res.json();
}

export async function terminateCall(
  id: string,
  reason: string = "operator_terminated"
): Promise<{ success: boolean; message?: string }> {
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
