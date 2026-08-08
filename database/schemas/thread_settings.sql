-- 討論串/貼文城堡法設定資料表 (public.thread_settings)
CREATE TABLE IF NOT EXISTS public.thread_settings (
  thread_id VARCHAR(64) PRIMARY KEY,
  guild_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  coworker_ids TEXT[] NOT NULL DEFAULT '{}',
  blacklist_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 按 Guild ID 之過濾與維護輔助索引
CREATE INDEX IF NOT EXISTS idx_thread_settings_guild_id ON public.thread_settings (guild_id);
