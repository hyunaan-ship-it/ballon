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

CREATE POLICY "Allow anon read" ON public.winners
  FOR SELECT USING (true);

CREATE POLICY "Allow anon insert" ON public.winners
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon delete" ON public.winners
  FOR DELETE USING (true);

-- Optional: index for faster filtering by account
CREATE INDEX IF NOT EXISTS idx_winners_account_id ON public.winners (account_id, created_at);
