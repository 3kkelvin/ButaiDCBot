/**
 * 討論串/貼文城堡法設定資料表 DAO 介面 (public.thread_settings)
 */
export interface IThreadSetting {
  /** 討論串/貼文 Snowflake ID (Primary Key) */
  thread_id: string;

  /** 伺服器 Guild ID */
  guild_id: string;

  /** 帖子原作者 Snowflake ID */
  owner_id: string;

  /** 是否處於鎖定狀態 */
  is_locked: boolean;

  /** 帖子協作者 Snowflake ID 陣列 */
  coworker_ids: string[];

  /** 帖子黑名單 Snowflake ID 陣列 */
  blacklist_ids: string[];

  /** 建立時間 ISO 字串 */
  created_at?: string;

  /** 更新時間 ISO 字串 */
  updated_at?: string;
}
