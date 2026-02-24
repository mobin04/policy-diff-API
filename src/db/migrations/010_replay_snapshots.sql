CREATE TABLE replay_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  raw_html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_replay_snapshots_created_at
ON replay_snapshots(created_at DESC);
