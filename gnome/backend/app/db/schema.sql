-- Tiger Data (TimescaleDB on Postgres) schema. Applied idempotently at startup.

-- One row per finished call: the gnome that answered and the full transcript.
-- transcript is an ordered JSON array of {seq, ts, speaker: "caller"|"gnome", text}.
CREATE TABLE IF NOT EXISTS calls (
    id                UUID PRIMARY KEY,
    twilio_call_sid   TEXT UNIQUE,
    caller_number     TEXT,
    gnome_name        TEXT,
    gnome_backstory   TEXT,
    gnome_personality JSONB,
    started_at        TIMESTAMPTZ NOT NULL,
    ended_at          TIMESTAMPTZ,
    duration_s        INT,
    end_reason        TEXT,
    transcript        JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);

-- At most one recording per call. Stereo WAV: left = caller, right = gnome
CREATE TABLE IF NOT EXISTS call_audio (
    call_id     UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
    format      TEXT NOT NULL DEFAULT 'wav',
    sample_rate INT NOT NULL DEFAULT 8000,
    channels    INT NOT NULL DEFAULT 2,
    audio       BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);
