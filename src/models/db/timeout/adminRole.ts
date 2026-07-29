/**
 * 全域 /timeout 管理員身分組資料庫模型 (timeout_global_admin_roles)
 */
export interface ITimeoutGlobalAdminRole {
  /** 資料庫主鍵 ID */
  id?: string;

  /** Discord 伺服器 ID (Guild ID) */
  guild_id: string;

  /** 被賦予全域 Timeout 管理員權限的 Discord 身分組 ID */
  role_id: string;

  /** 紀錄建立時間 (ISO 8601 時間字串) */
  created_at?: string;
}

/**
 * 單一頻道專屬 /timeout 管理員身分組資料庫模型 (timeout_single_admin_roles)
 */
export interface ITimeoutSingleAdminRole {
  /** 資料庫主鍵 ID */
  id?: string;

  /** Discord 伺服器 ID (Guild ID) */
  guild_id: string;

  /** 限制生效的 Discord 頻道 ID (Channel ID) */
  channel_id: string;

  /** 被賦予該頻道專屬 Timeout 管理權限的 Discord 身分組 ID */
  role_id: string;

  /** 紀錄建立時間 (ISO 8601 時間字串) */
  created_at?: string;
}
