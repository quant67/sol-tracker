-- Price behavior monitoring schema (MVP)

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

CREATE INDEX IF NOT EXISTS idx_watch_tokens_active
  ON watch_tokens(is_active);

CREATE INDEX IF NOT EXISTS idx_price_strategies_active
  ON price_strategies(is_active, watch_token_id);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time
  ON price_snapshots(watch_token_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_alert_events_strategy_time
  ON price_alert_events(strategy_id, triggered_at DESC);

ALTER TABLE watch_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to watch_tokens"
  ON watch_tokens FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to price_strategies"
  ON price_strategies FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to price_snapshots"
  ON price_snapshots FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to price_alert_events"
  ON price_alert_events FOR ALL USING (true) WITH CHECK (true);
