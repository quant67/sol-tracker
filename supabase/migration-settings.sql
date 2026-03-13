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
