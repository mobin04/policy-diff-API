-- Remove usage_count and rate_limit from api_keys
ALTER TABLE api_keys DROP COLUMN IF EXISTS usage_count;
ALTER TABLE api_keys DROP COLUMN IF EXISTS rate_limit;

-- Add email column (required)
-- Set default value for existing rows, then drop default
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS email TEXT DEFAULT 'system@example.com';
ALTER TABLE api_keys ALTER COLUMN email DROP DEFAULT;
ALTER TABLE api_keys ALTER COLUMN email SET NOT NULL;

-- Add partial unique constraint for email
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_email_active ON api_keys(email) WHERE is_active = true;
