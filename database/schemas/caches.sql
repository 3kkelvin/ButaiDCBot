-- 1. 全域快取表 (Global Cache Table)
-- 用於跨實例/跨重啟持久化快取，以減輕 Discord API 與 DB 的頻率限制
CREATE TABLE IF NOT EXISTS public.caches (
    cache_key VARCHAR(255) PRIMARY KEY,                             -- 快取鍵 (主鍵)
    category VARCHAR(50) NOT NULL,                                  -- 業務分類 (例如: PING_TEST, GUILD_CONFIG)
    data JSONB NOT NULL,                                            -- 快取內文 (JSONB 格式)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL                    -- 快取過期截止時間
);

-- 快取表索引配置
CREATE INDEX IF NOT EXISTS idx_caches_category ON public.caches(category);
CREATE INDEX IF NOT EXISTS idx_caches_expires_at ON public.caches(expires_at);

COMMENT ON TABLE public.caches IS '全域快取資料表，用以進行 Promise Collapsing 快取控制與減輕外部請求衝擊';
COMMENT ON COLUMN public.caches.cache_key IS '快取唯一鍵';
COMMENT ON COLUMN public.caches.category IS '快取分類分類';
COMMENT ON COLUMN public.caches.data IS '快取的 JSONB Payload 內文';
COMMENT ON COLUMN public.caches.expires_at IS '快取失效截止時間戳';

-- 啟用行級安全策略 (RLS)，保障 anon 金鑰安全性，僅允許管理員 service_role 讀寫
ALTER TABLE public.caches ENABLE ROW LEVEL SECURITY;
