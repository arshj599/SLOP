CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT NOT NULL,
  rating NUMERIC,
  user_count BIGINT,
  cost_tier TEXT,
  complexity_tier TEXT,
  url TEXT NOT NULL,
  categories JSONB NOT NULL DEFAULT '[]',
  install_steps JSONB NOT NULL DEFAULT '[]',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recommendation_cache (
  cache_key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS recommendation_cache_expires_at_idx ON recommendation_cache (expires_at);
CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  domain TEXT,
  task_category TEXT,
  user_id_hashed TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_type_timestamp_idx ON usage_events (event_type, timestamp);
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_user_bucket_timestamp_idx ON rate_limits (user_id, bucket, timestamp);
