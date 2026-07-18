-- 2. 分散式鎖資料表 (Distributed Locks Table)
-- 用於跨並發、防按鈕連點或重複 Webhook 請求的互斥鎖控制
CREATE TABLE IF NOT EXISTS public.distributed_locks (
    lock_key VARCHAR(255) PRIMARY KEY,                               -- 鎖定識別鍵 (主鍵)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP     -- 鎖定建立時間
);

COMMENT ON TABLE public.distributed_locks IS '通用分散式互斥鎖資料表，利用 Primary Key Unique 限制防範高並發連點';
COMMENT ON COLUMN public.distributed_locks.lock_key IS '鎖定唯一辨識鍵';
COMMENT ON COLUMN public.distributed_locks.created_at IS '鎖定加鎖成功時間戳';

-- 啟用行級安全策略 (RLS)，保障 anon 金鑰安全性，僅允許管理員 service_role 讀寫
ALTER TABLE public.distributed_locks ENABLE ROW LEVEL SECURITY;
