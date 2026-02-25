-- Add isolation stability instrumentation to pages table
-- This allows PolicyDiff to track deterministic container selection across runs

ALTER TABLE pages
ADD COLUMN isolation_fingerprint TEXT;
