/**
 * 伺服器 Timeout 禁言與監獄設定資料庫模型 (timeout_settings)
 */
export interface ITimeoutSetting {
  /** Discord 伺服器 ID (Guild ID) */
  guild_id: string;

  /** 單一頻道禁言上限時長 (分鐘) */
  single_limit_minutes: number;

  /** 全服監獄/禁言上限時長 (分鐘) */
  global_limit_minutes: number;

  /** 紀錄建立時間 (ISO 8601 時間字串) */
  created_at?: string;

  /** 紀錄更新時間 (ISO 8601 時間字串) */
  updated_at?: string;
}
