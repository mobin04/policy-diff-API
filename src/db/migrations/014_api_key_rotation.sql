-- Add rotated_at timestamp to api_keys table for security auditing
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;
