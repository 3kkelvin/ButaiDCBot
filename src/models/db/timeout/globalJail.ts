/**
 * 全服監獄囚犯紀錄資料庫模型 (timeout_global_jails)
 */
export interface ITimeoutGlobalJail {
  /** 資料庫主鍵 ID */
  id?: string;

  /** Discord 伺服器 ID (Guild ID) */
  guild_id: string;

  /** 入獄的 Discord 使用者 ID (User ID) */
  user_id: string;

  /** 關押類型：'prisoner' (普通囚犯) 或 'special' (特殊關押) */
  confinement_type: 'prisoner' | 'special';

  /** 入獄前被剝奪備份的原本 Discord 身分組 ID 清單 */
  original_roles: string[];

  /** 預計釋放關押的時間 (ISO 8601 時間字串) */
  release_at: string;

  /** 入獄原因說明 */
  reason?: string;

  /** 警告狀態或註記訊息 */
  warned?: string;

  /** 紀錄建立時間 (ISO 8601 時間字串) */
  created_at?: string;
}
