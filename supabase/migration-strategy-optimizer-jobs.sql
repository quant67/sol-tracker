-- Strategy optimizer async jobs

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

CREATE INDEX IF NOT EXISTS idx_strategy_optimization_jobs_status_created
  ON strategy_optimization_jobs(status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_strategy_optimization_jobs_token_created
  ON strategy_optimization_jobs(watch_token_id, created_at DESC);

ALTER TABLE strategy_optimization_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to strategy_optimization_jobs"
  ON strategy_optimization_jobs FOR ALL USING (true) WITH CHECK (true);
