-- Run this SQL in your Supabase project's SQL Editor to create the winners table.
-- Go to: https://app.supabase.com > Your Project > SQL Editor > New Query

CREATE TABLE IF NOT EXISTS public.winners (
  id          BIGSERIAL PRIMARY KEY,
  account_id  TEXT        NOT NULL,
  employee_id TEXT        NOT NULL,
  phone_number TEXT       NOT NULL,
  prize       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow anonymous reads and inserts (required since we use the anon key from the frontend)
ALTER TABLE public.winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read" ON public.winners;
CREATE POLICY "Allow anon read" ON public.winners
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon insert" ON public.winners;
CREATE POLICY "Allow anon insert" ON public.winners
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete" ON public.winners;
CREATE POLICY "Allow anon delete" ON public.winners
  FOR DELETE USING (true);

-- Optional: index for faster filtering by account
CREATE INDEX IF NOT EXISTS idx_winners_account_id ON public.winners (account_id, created_at);

-- Create table for storing persistent game board state (prizes, popped balloons, settings)
CREATE TABLE IF NOT EXISTS public.board_state (
  account_id          TEXT        PRIMARY KEY,
  prizes              JSONB       NOT NULL,
  popped              JSONB       NOT NULL,
  require_winner_info JSONB       NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow anonymous reads, inserts, updates, and deletes
ALTER TABLE public.board_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read board" ON public.board_state;
CREATE POLICY "Allow anon read board" ON public.board_state
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon insert board" ON public.board_state;
CREATE POLICY "Allow anon insert board" ON public.board_state
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update board" ON public.board_state;
CREATE POLICY "Allow anon update board" ON public.board_state
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anon delete board" ON public.board_state;
CREATE POLICY "Allow anon delete board" ON public.board_state
  FOR DELETE USING (true);
