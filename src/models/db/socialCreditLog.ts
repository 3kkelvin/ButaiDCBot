/**
 * 公務員計點與加減分日誌模型 (Social Credit Log)
 */
export interface ISocialCreditLog {
  /** 記點日誌唯一標識符 (UUID，由資料庫預設自動生成) */
  id?: string;

  /** Discord 伺服器 (Guild) ID */
  guild_id: string;

  /** 被處分/審核的管理人員 Discord User ID */
  target_user_id: string;

  /** 執行處分/審核的管理者 Discord User ID */
  executor_user_id: string;

  /** 異動類型 (true: 加分, false: 減分) */
  is_add: boolean;

  /** 異動點數 (數值範圍 1 ~ 6 分) */
  points: number;

  /** 加減分處分之詳細理由與說明文字 */
  reason: string;

  /** 紀錄建立時間戳記 (ISO 8601 格式 TIMESTAMPTZ) */
  created_at?: string;

  /** 軟刪除時間戳記 (ISO 8601 格式 TIMESTAMPTZ，null 表示未刪除/有效紀錄) */
  deleted_at?: string | null;
}
