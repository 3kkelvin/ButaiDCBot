-- 公務員計點與加減分日誌表 (含軟刪除審計追蹤)
CREATE TABLE IF NOT EXISTS social_credit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(32) NOT NULL,
    target_user_id VARCHAR(32) NOT NULL,
    executor_user_id VARCHAR(32) NOT NULL,
    is_add BOOLEAN NOT NULL,          -- true: 加分, false: 減分
    points INT NOT NULL,              -- 異動分數 (1 ~ 6)
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ DEFAULT NULL -- 軟刪除時間戳記 (null 表示未刪除/有效紀錄)
);

-- 建立 Partial Index 針對有效紀錄優化查詢效能 (Postgres / Supabase Best Practice)
CREATE INDEX IF NOT EXISTS idx_social_credit_guild_target_active 
ON social_credit_logs(guild_id, target_user_id) 
WHERE deleted_at IS NULL;
