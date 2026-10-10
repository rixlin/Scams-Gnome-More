-- Tiger Data (TimescaleDB on Postgres) schema. Applied idempotently at startup.

CREATE TABLE IF NOT EXISTS gnomes (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    backstory   TEXT NOT NULL,
    personality JSONB,
    voice_id    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
    id              UUID PRIMARY KEY,
    twilio_call_sid TEXT UNIQUE,
    caller_number   TEXT,
    gnome_id        UUID REFERENCES gnomes(id),
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    duration_s      INT,
    end_reason      TEXT
);
CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);

-- Transcript lines: who was talking, what they said, which gnome
CREATE TABLE IF NOT EXISTS utterances (
    call_id  UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    ts       TIMESTAMPTZ NOT NULL,
    seq      INT NOT NULL,
    speaker  TEXT NOT NULL CHECK (speaker IN ('caller', 'gnome')),
    gnome_id UUID,
    text     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS utterances_call_idx ON utterances (call_id, seq);

-- Stereo WAV: left = caller, right = gnome
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
