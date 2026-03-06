-- Migration: Add people table and link addresses to people
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Create people table
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to people" ON people FOR ALL USING (true) WITH CHECK (true);

-- 3. Add person_id column to addresses (nullable for backward compat)
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES people(id) ON DELETE CASCADE;

-- 4. Migrate existing addresses: create a "Default" person for orphaned addresses
DO $$
DECLARE
  default_person_id UUID;
BEGIN
  -- Only create default person if there are orphaned addresses
  IF EXISTS (SELECT 1 FROM addresses WHERE person_id IS NULL) THEN
    INSERT INTO people (name) VALUES ('Default') RETURNING id INTO default_person_id;
    UPDATE addresses SET person_id = default_person_id WHERE person_id IS NULL;
  END IF;
END $$;

-- 5. Drop the old logs FK on addresses.address to avoid conflicts
-- (logs now reference the address text directly, no need to change logs table)
