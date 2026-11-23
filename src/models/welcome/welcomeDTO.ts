/**
 * 操作動作：啟用/覆蓋 (on) 或 關閉 (off)
 */
export type WelcomeAction = 'on' | 'off';

/**
 * 伺服器新成員歡迎配置介面 (DAO / Entity)
 */
export interface IWelcomeConfig {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 發送歡迎訊息之文字頻道 ID */
  channelId: string;
  /** 自訂歡迎詞內文 */
  context: string;
  /** 是否啟用歡迎功能 */
  enabled: boolean;
  /** 配置更新時間戳 (ISO8601) */
  updatedAt: string;
}

/**
 * 待刪除之過期歡迎訊息項目 (DTO)
 */
export interface IPendingDeletionItem {
  /** 訊息所在之頻道 ID */
  channelId: string;
  /** 訊息 ID */
  messageId: string;
  /** Redis Sorted Set 原始儲存字串 (channelId:messageId) */
  raw: string;
}

/**
 * 歡迎打招呼按鈕互動資料 (DTO)
 */
export interface IWelcomeGreetDTO {
  /** 被歡迎的目標成員 ID */
  targetMemberId: string;
  /** 點擊打招呼按鈕的成員 ID */
  clickerId: string;
  /** 點擊打招呼按鈕的成員名稱 */
  clickerName: string;
}

/**
 * 設定新成員歡迎功能之傳入參數 (DTO)
 */
export interface IWelcomeSetupDTO {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 操作動作 */
  action: WelcomeAction;
  /** 發送歡迎訊息之文字頻道 ID */
  channelId?: string;
  /** 自訂歡迎詞內文 */
  context?: string;
}
