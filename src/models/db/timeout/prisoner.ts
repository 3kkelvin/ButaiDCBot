/**
 * 單一頻道專屬禁言/受限使用者資料庫模型 (timeout_prisoners)
 */
export interface ITimeoutPrisoner {
  /** 資料庫主鍵 ID */
  id?: string;

  /** Discord 伺服器 ID (Guild ID) */
  guild_id: string;

  /** 禁言生效的特定頻道 ID (Channel ID) */
  channel_id: string;

  /** 被禁言的 Discord 使用者 ID (User ID) */
  user_id: string;

  /** 預計解除禁言的時間 (ISO 8601 時間字串) */
  release_at: string;

  /** 禁言原因說明 */
  reason?: string;

  /** 是否已發送過到期前警告通知或相關警告註記 */
  warned?: string;

  /** 紀錄建立時間 (ISO 8601 時間字串) */
  created_at?: string;
}
