<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Gnome Frontend Console - System Design & Implementation Plan (Revised)

## Goal Description
The **Gnome Frontend Console** is the web dashboard inside `gnome/frontend/` that manages the **Gnome Backend**. The backend is a real-time counter-scam system connecting to virtual phone numbers via Twilio to intercept human and AI scam callers, disrupting them with paradoxical loops, stalls, and custom Gnome personas.

The frontend is built with **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS v4**.

---

## User Review Required

> [!IMPORTANT]
> **Gnome State Nomenclature:**
> Per instructions, the state sequence is:
> 1. `listening`
> 2. `analyzing`
> 3. `crafting` (thinking)
> 4. `brewing` *(gnome-themed replacement for "synthesizing", alternatively `concocting`)*
> 5. `responding`
>
> In the live transcript, this pipeline is displayed as a single inline sequence of steps (e.g., `listening → analyzing → crafting → brewing → responding`) for each conversation turn.

> [!NOTE]
> **Independent Overlapped Audio Playback:**
> The inbound caller audio stream and outbound Gnome audio stream are played back independently and concurrently through separate Web Audio / HTML5 audio pipelines—without merging or re-encoding on the client.

---

## Architecture Diagram

```mermaid
graph TD
    subgraph Gnome Frontend (Next.js 16)
        Home["Home Page (/)</br>Active & Ended Call Grids"]
        Session["Call Session Page (/calls/[id])</br>Overlapped Audio, Live Transcript, Live Gnome Controls"]
        SettingsModal["Universal Settings Pop-up</br>Twilio Connection & System Settings"]
        WSClient["WebSocket Client</br>Audio Streams (User & Gnome) + Telemetry"]
        RestClient["REST Client (Fetch)</br>GET / POST APIs"]
    end

    subgraph Gnome Backend (Twilio + Agent)
        REST["REST API</br>Calls, Gnome Live Edits, Settings, Terminate"]
        WS_Caller["WS: User / Twilio Audio Stream"]
        WS_Gnome["WS: Gnome Response Audio Stream"]
        WS_Telem["WS: Call Telemetry & State Stream"]
    end

    Home --> RestClient
    Session --> RestClient
    Session --> WSClient
    SettingsModal --> RestClient
    RestClient --> REST
    WSClient --> WS_Caller
    WSClient --> WS_Gnome
    WSClient --> WS_Telem
```

---

## Detailed Page & Component Specifications

### 1. Home Page (`/`)
The primary portion of the Home Page consists of two clearly divided sections:

#### Section A: Active Calls
* Grid layout rendering responsive rows of call boxes (1 column on mobile, 2–3 on tablet, 3–4 on large desktop).
* Highlights real-time ongoing calls with active status indicator and live time elapsed.
* Clicking any box navigates directly to `/calls/[id]`.

#### Section B: Ended Calls
* Grid layout matching the active calls section, showing completed call sessions.
* Sorted chronologically (most recently ended first) with quick search/filter by phone number or date.

#### Call Session Box Contents (Strict Requirements)
Every call box in both Active and Ended sections contains strictly the following fields:
1. **Scammer's Number** (e.g., `+1 (555) 349-2018`)
2. **Region** (e.g., `New York, USA` / `Toll Free`)
3. **Gnome's Number** (The specific virtual Twilio phone number that received/forwarded the call, e.g., `+1 (800) 420-GNOM`)
4. **Name of Gnome "Assigned"** (Only the name, e.g., `Gnome Barnaby` — no backstory or personality clutter)
5. **Real Time Started** (Timestamp, e.g., `Today, 1:42 PM`)
6. **Time Elapsed** (Live counter for active calls, final duration for ended calls, e.g., `12m 45s`)
7. **Action / Status Badge**:
   - For Active: `🟢 LIVE` badge + "Enter Session" button + Quick "Terminate" button.
   - For Ended: `Ended` badge + "View Summary" button.

---

### 2. Selected Call Session Page (`/calls/[id]`)

#### A. Session Header & Call Control
* Numbers & Assignment: Scammer Number, Region, Twilio Virtual Number, Assigned Gnome Name.
* Real-time Duration Counter & Live Status.
* **Call Termination Button** (Calls `POST /api/calls/:id/terminate` with confirmation).

#### B. Independent Overlapped Audio Monitor
* Connects to both WebSockets simultaneously:
  - Inbound user/scammer audio stream (from Twilio).
  - Outbound Gnome audio stream.
* Two parallel Web Audio nodes playing simultaneously through the browser speakers without merging/re-encoding.
* Operator volume controls:
  - Master Mute / Listen toggle.
  - Independent volume / balance sliders (User volume vs. Gnome volume).
  - Real-time visual activity bars (showing which party is currently making sound).

#### C. Live Transcript with Inline Gnome State Sequence
* Scrollable chronological conversation feed displaying caller dialogue and Gnome dialogue.
* **Gnome State Pipeline Line:**
  - Before/during each Gnome speech turn, an inline single-line state step indicator is logged:
    ```
    [1:43:02 PM] ─── listening ──> analyzing ──> crafting ──> brewing ──> responding
    ```
  - Real-time indicator pulses on the current state while in-flight, then freezes as historical record once Gnome begins responding.
* Turnaround timestamps recorded next to each dialogue turn.

#### D. Live Gnome Controls (Edits & Feedback)
* Displays call-specific gnome details (fetched from `GET /api/calls/:id`):
  - Current Gnome Name
  - Personality description
  - Backstory snippet
* **Live Edits Panel (`POST /api/calls/:id/gnome/update`):**
  - **Personality / Behavior Tweaks:** Text input or adjustments to modify Gnome's demeanor mid-call.
  - **Live Feedback & Prompt Injections:** Send instantaneous cues to the Gnome (e.g., *"Ask him why his background has rooster noises"*, *"Pretend you can't hear him and start talking about gnomes"*).
  - "Apply Live Edits" button with instant submission feedback.

---

### 3. Universal Settings Pop-Up (Global Overlay Modal)
A modal accessible from anywhere via the top navigation bar (or `Ctrl+,`):
* **Twilio Virtual Phone Management:**
  - Configured virtual phone numbers.
  - Connection status & webhook endpoint test (`POST /api/twilio/connect`).
  - Account SID & Auth credentials setup.
* **Misc. System Settings:**
  - Backend server API URL & WebSocket host URLs.
  - Auto-termination policies (e.g., maximum call timeout).
  - Audio output device selector.

---

## Backend API & WebSocket Contracts

### 1. REST Endpoints

```typescript
// GET /api/calls
// Returns all calls for Active and Ended grids
type CallSessionSummary = {
  id: string;
  scammer_number: string;
  region: string;
  gnome_number: string;        // Virtual Twilio number handling this call
  gnome_name: string;          // Name of gnome assigned
  started_at: string;          // ISO timestamp
  ended_at?: string | null;    // ISO timestamp or null if active
  duration_seconds: number;
  status: "active" | "ended";
};

// GET /api/calls/:id
// Returns full details for selected session
type CallSessionDetail = {
  id: string;
  scammer_number: string;
  region: string;
  gnome_number: string;
  gnome: {
    name: string;
    personality: string;
    backstory: string;
  };
  started_at: string;
  ended_at?: string | null;
  status: "active" | "ended";
  transcript: Array<{
    id: string;
    speaker: "user" | "gnome";
    text: string;
    timestamp: string;
    state_history?: Array<"listening" | "analyzing" | "crafting" | "brewing" | "responding">;
  }>;
};

// POST /api/calls/:id/terminate
// Payload: { reason?: string }

// POST /api/calls/:id/gnome/update
// Payload: { personality?: string; feedback?: string; instruction?: string }

// POST /api/twilio/connect
// Payload: { phone_number?: string; account_sid?: string; auth_token?: string }

// GET /api/settings and POST /api/settings
// System settings payload
```

### 2. WebSocket Channels

```typescript
// 1. Inbound User Audio: ws://<backend>/ws/calls/:id/audio/user
// 2. Outbound Gnome Audio: ws://<backend>/ws/calls/:id/audio/gnome
// Both stream binary audio chunks or { audio: string } played in browser simultaneously.

// 3. Telemetry Feed: ws://<backend>/ws/calls/:id/telemetry
type TelemetryPacket =
  | { type: "active_speaker"; speaker: "user" | "gnome" | "none"; timestamp: string }
  | { type: "gnome_state_step"; state: "listening" | "analyzing" | "crafting" | "brewing" | "responding"; timestamp: string }
  | { type: "transcript_chunk"; speaker: "user" | "gnome"; text: string; is_final: boolean; timestamp: string }
  | { type: "call_terminated"; timestamp: string };
```

---

## Codebase Implementation Structure

```
gnome/frontend/
├── app/
│   ├── layout.tsx                     # Root layout, Navbar with Settings trigger
│   ├── page.tsx                       # Home page (Active & Ended Call Grid sections)
│   ├── calls/
│   │   └── [id]/
│   │       └── page.tsx               # Selected Call Session Console
│   └── globals.css                    # Tailwind CSS v4 setup & theme styles
├── components/
│   ├── layout/
│   │   └── Navbar.tsx                 # Header, branding, Settings button
│   ├── home/
│   │   ├── CallSection.tsx            # Generic container for Active / Ended sections
│   │   └── CallBox.tsx                # Single call box (scammer #, region, gnome #, name, times)
│   ├── session/
│   │   ├── SessionHeader.tsx          # Call numbers, status, terminate button
│   │   ├── OverlappedAudioPlayer.tsx  # Dual Web Audio players (User + Gnome)
│   │   ├── TranscriptFeed.tsx         # Transcript dialogue with single-line state history
│   │   ├── StateStepsLine.tsx         # Component rendering: listening → analyzing → crafting → brewing → responding
│   │   └── GnomeLiveEditor.tsx        # Call-specific personality/feedback live edit form
│   ├── settings/
│   │   └── UniversalSettingsModal.tsx # Pop-up overlay (Twilio connection & system settings)
│   └── ui/                            # Buttons, inputs, modals, badges
├── hooks/
│   ├── useOverlappedAudio.ts          # Simultaneous audio stream playback
│   ├── useCallTelemetry.ts            # WebSocket listener for state steps & transcript
│   └── useCallDuration.ts             # Live ticking timer hook
└── lib/
    ├── types.ts                       # Shared types for calls, gnome details, telemetry
    └── api.ts                         # REST fetch client for GET/POST endpoints
```

---

## Verification Plan

### Automated Build Checks
```powershell
cd gnome/frontend
npm run build
npm run lint
```

### Manual Verification Steps
1. **Home Page Layout:**
   - Verify that the Home page displays two distinct sections: **Active Calls** and **Ended Calls**.
   - Verify that call boxes arrange into responsive multi-box rows.
   - Verify each box strictly presents: Scammer number, Region, Gnome's Twilio virtual number, Assigned Gnome name, Start time, Elapsed time.
2. **Universal Settings Pop-Up:**
   - Open modal via header button from both the Home page and an active session.
   - Verify Twilio virtual phone connection form and misc. system settings.
3. **Session Console:**
   - Navigate to `/calls/:id`.
   - Verify dual audio player connects and plays user and gnome streams concurrently with individual volume sliders.
   - Verify transcript renders turns with the historical single line: `listening → analyzing → crafting → brewing → responding`.
   - Test submitting live personality changes and prompt feedback via `POST /api/calls/:id/gnome/update`.
   - Test call termination button via `POST /api/calls/:id/terminate`.
