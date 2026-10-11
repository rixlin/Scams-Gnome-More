export type GnomeState =
  | "listening"
  | "analyzing"
  | "crafting"
  | "brewing"
  | "responding"
  | "idle"
  | "thinking"
  | "speaking";

export const GNOME_STATE_PIPELINE: readonly GnomeState[] = [
  "listening",
  "analyzing",
  "crafting",
  "brewing",
  "responding",
] as const;

export interface CallSessionSummary {
  id: string;
  call_id?: string;
  scammer_number: string;
  caller_number?: string;
  region: string;
  country?: string;
  gnome_number: string; // The specific virtual Twilio phone number provided by backend
  gnome_name: string; // Name of gnome assigned
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  duration_s?: number;
  status: "active" | "ended";
  recording_url?: string | null;
  recording_status?: "available" | "unavailable";
  has_audio?: boolean;
}

export interface GnomeProfile {
  name: string;
  personality: string;
  backstory: string;
}

export interface TranscriptTurn {
  id: string;
  speaker: "user" | "caller" | "gnome" | "operator";
  text: string;
  timestamp: string; // Real-time timestamp (ISO string)
  in_call_time?: string; // In-call relative timestamp (e.g. "+00:15")
  state_history?: GnomeState[];
  feedback_cue?: string;
  seq?: number;
  final?: boolean;
}

export interface CallSessionDetail {
  id: string;
  call_id?: string;
  scammer_number: string;
  caller_number?: string;
  region: string;
  country?: string;
  gnome_number: string;
  gnome: GnomeProfile;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  duration_s?: number;
  status: "active" | "ended";
  recording_url?: string | null;
  recording_status?: "available" | "unavailable";
  has_audio?: boolean;
  transcript: TranscriptTurn[];
  utterances?: TranscriptTurn[];
}

export interface LiveGnomeUpdateRequest {
  personality?: string;
  feedback?: string;
  instruction?: string;
  voice_id?: string;
}

export interface SystemSettings {
  backend_api_url: string;
  backend_ws_url: string;
  auto_terminate_seconds: number;
  // Backend AI engine settings
  default_personality?: string;
  voice_id?: string | null;
  max_call_seconds?: number;
  generate_new_gnome_per_call?: boolean;
  fixed_gnome?: Record<string, unknown> | null;
  aggression?: number;
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
}

export type AudioPlaybackMode = "stereo" | "mono";

export interface BackendLiveEvent {
  type:
    | "call.started"
    | "call.ended"
    | "audio.caller"
    | "audio.gnome"
    | "transcript"
    | "gnome.response"
    | "gnome.updated"
    | "telemetry"
    | "error";
  ts: string;
  call_id: string;
  data: Record<string, unknown>;
}

export type TelemetryEvent =
  | {
      type: "active_speaker";
      speaker: "user" | "caller" | "gnome" | "none";
      timestamp: string;
    }
  | {
      type: "gnome_state_step";
      state: GnomeState;
      timestamp: string;
    }
  | {
      type: "transcript_chunk";
      speaker: "user" | "caller" | "gnome" | "operator";
      text: string;
      is_final: boolean;
      timestamp: string;
      turn_id?: string;
      in_call_time?: string;
      feedback_cue?: string;
    }
  | {
      type: "call_terminated";
      reason?: string;
      timestamp: string;
    };
