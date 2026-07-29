-- 頻道區域禁言與全服監獄管理資料表
CREATE TABLE IF NOT EXISTS timeout_global_admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(32) NOT NULL,
    role_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_guild_global_admin_role UNIQUE (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS timeout_single_admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(32) NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    role_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_guild_channel_single_admin_role UNIQUE (guild_id, channel_id, role_id)
);

CREATE TABLE IF NOT EXISTS timeout_prisoners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(32) NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    release_at TIMESTAMPTZ NOT NULL,
    reason TEXT DEFAULT '',
    warned VARCHAR(10) DEFAULT '是',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_guild_channel_prisoner UNIQUE (guild_id, channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS timeout_global_jail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    confinement_type VARCHAR(20) NOT NULL DEFAULT 'prisoner', -- 'prisoner' 或 'special'
    original_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    release_at TIMESTAMPTZ NOT NULL,
    reason TEXT DEFAULT '',
    warned VARCHAR(10) DEFAULT '是',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_guild_user_global_jail UNIQUE (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS timeout_settings (
    guild_id VARCHAR(32) PRIMARY KEY,
    single_limit_minutes INT NOT NULL DEFAULT 1440,
    global_limit_minutes INT NOT NULL DEFAULT 10080,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index 優化查詢效能
CREATE INDEX IF NOT EXISTS idx_timeout_prisoners_active 
ON timeout_prisoners(guild_id, channel_id, release_at);

CREATE INDEX IF NOT EXISTS idx_timeout_prisoners_release_at
ON timeout_prisoners(release_at);

CREATE INDEX IF NOT EXISTS idx_timeout_global_jail_release_at
ON timeout_global_jail(release_at);

CREATE INDEX IF NOT EXISTS idx_timeout_single_admin_roles_lookup
ON timeout_single_admin_roles(guild_id, channel_id);
