-- Schema for Sol-Tracker (complete, includes people grouping)

-- People table (groups addresses by person/entity)
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Addresses table (linked to people)
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address TEXT UNIQUE NOT NULL,
  label TEXT,                  -- optional per-address note
  is_active BOOLEAN DEFAULT true,
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Logs table (transaction records)
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address TEXT REFERENCES addresses(address) ON DELETE CASCADE,
  signature TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  token_info JSONB,
  amount TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Policies (self-use project)
CREATE POLICY "Allow all access to people" ON people FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to addresses" ON addresses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to logs" ON logs FOR ALL USING (true) WITH CHECK (true);

-- Settings table for global configurations
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert default market cap threshold (0 = no filter)
INSERT INTO app_settings (key, value)
VALUES ('min_mc_threshold', '0')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- Price behavior monitoring tables
CREATE TABLE IF NOT EXISTS watch_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mint TEXT UNIQUE NOT NULL,
  symbol TEXT,
  name TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_price NUMERIC,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS price_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watch_token_id UUID REFERENCES watch_tokens(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  params JSONB DEFAULT '{}'::jsonb NOT NULL,
  cooldown_sec INTEGER DEFAULT 300 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  chat_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watch_token_id UUID REFERENCES watch_tokens(id) ON DELETE CASCADE NOT NULL,
  price NUMERIC NOT NULL,
  source TEXT DEFAULT 'dexscreener' NOT NULL,
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS price_alert_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID REFERENCES price_strategies(id) ON DELETE CASCADE NOT NULL,
  watch_token_id UUID REFERENCES watch_tokens(id) ON DELETE CASCADE NOT NULL,
  mint TEXT NOT NULL,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  snapshot JSONB DEFAULT '{}'::jsonb NOT NULL,
  dedupe_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_watch_tokens_active ON watch_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_price_strategies_active ON price_strategies(is_active, watch_token_id);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time ON price_snapshots(watch_token_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_alert_events_strategy_time ON price_alert_events(strategy_id, triggered_at DESC);

CREATE TABLE IF NOT EXISTS strategy_optimization_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watch_token_id UUID REFERENCES watch_tokens(id) ON DELETE CASCADE NOT NULL,
  mint TEXT NOT NULL,
  history_days INTEGER NOT NULL,
  interval TEXT NOT NULL,
  style TEXT NOT NULL,
  status TEXT DEFAULT 'queued' NOT NULL,
  progress_message TEXT,
  provider TEXT,
  pool_address TEXT,
  pool_name TEXT,
  result_json JSONB,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0 NOT NULL,
  requested_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_strategy_optimization_jobs_status_created ON strategy_optimization_jobs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_strategy_optimization_jobs_token_created ON strategy_optimization_jobs(watch_token_id, created_at DESC);

ALTER TABLE watch_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_optimization_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to watch_tokens" ON watch_tokens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to price_strategies" ON price_strategies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to price_snapshots" ON price_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to price_alert_events" ON price_alert_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to strategy_optimization_jobs" ON strategy_optimization_jobs FOR ALL USING (true) WITH CHECK (true);
