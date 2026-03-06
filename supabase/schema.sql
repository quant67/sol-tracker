-- Create addresses table
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address TEXT UNIQUE NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create logs table
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address TEXT REFERENCES addresses(address) ON DELETE CASCADE,
  signature TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- SWAP, TRANSFER, etc.
  token_info JSONB,
  amount TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Create policies (for simplicity in this self-use project, we allow all access)
-- In a production environment, you would restrict this to authenticated users.
CREATE POLICY "Allow all access to addresses" ON addresses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to logs" ON logs FOR ALL USING (true) WITH CHECK (true);
