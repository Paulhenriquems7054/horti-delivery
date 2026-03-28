-- Add user_id to stores table
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_stores_user_id ON public.stores(user_id);

-- Update the default store to belong to the first admin user (if any)
-- This is a no-op if there are no users yet
UPDATE public.stores
SET user_id = (SELECT id FROM auth.users LIMIT 1)
WHERE user_id IS NULL;
