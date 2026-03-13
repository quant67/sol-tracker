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
