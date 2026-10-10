export type GnomeState =
  | "listening"
  | "analyzing"
  | "crafting"
  | "brewing"
  | "responding";

export const GNOME_STATE_PIPELINE: readonly GnomeState[] = [
  "listening",
  "analyzing",
  "crafting",
  "brewing",
  "responding",
] as const;

export interface CallSessionSummary {
  id: string;
  scammer_number: string;
  region: string;
  gnome_number: string; // The specific virtual Twilio phone number provided by backend
  gnome_name: string; // Name of gnome assigned
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  status: "active" | "ended";
}

export interface GnomeProfile {
  name: string;
  personality: string;
  backstory: string;
}

export interface TranscriptTurn {
  id: string;
  speaker: "user" | "gnome";
  text: string;
  timestamp: string;
  state_history?: GnomeState[];
}

export interface CallSessionDetail {
  id: string;
  scammer_number: string;
  region: string;
  gnome_number: string;
  gnome: GnomeProfile;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  status: "active" | "ended";
  transcript: TranscriptTurn[];
}

export interface LiveGnomeUpdateRequest {
  personality?: string;
  feedback?: string;
  instruction?: string;
}

export interface SystemSettings {
  backend_api_url: string;
  backend_ws_url: string;
  auto_terminate_seconds: number;
}

export type TelemetryEvent =
  | {
      type: "active_speaker";
      speaker: "user" | "gnome" | "none";
      timestamp: string;
    }
  | {
      type: "gnome_state_step";
      state: GnomeState;
      timestamp: string;
    }
  | {
      type: "transcript_chunk";
      speaker: "user" | "gnome";
      text: string;
      is_final: boolean;
      timestamp: string;
      turn_id?: string;
    }
  | {
      type: "call_terminated";
      reason?: string;
      timestamp: string;
    };
