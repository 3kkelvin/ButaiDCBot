/**
 * 訊息清理模組型別定義與 DTO
 */

/**
 * 清理任務按鈕自訂識別碼前綴
 */
export const PURGE_BUTTON_PREFIX = 'purge';

/**
 * 清理指令輸入參數介面
 */
export interface IPurgeOptions {
  /**
   * 目標使用者 Snowflake ID (支援在群內或已退群成員)
   */
  targetUserId: string;

  /**
   * 起始時間 (包含)
   */
  startDate: Date;

  /**
   * 結束時間 (包含)
   */
  endDate: Date;

  /**
   * 特定指定頻道 ID (可選，若無則遍歷全服文字頻道)
   */
  specificChannelId?: string;
}

/**
 * 進行中清理任務即時狀態介面
 */
export interface IActivePurgeTask {
  /**
   * 執行所在的伺服器 ID
   */
  guildId: string;

  /**
   * 發起指令的頻道 ID
   */
  interactionChannelId: string;

  /**
   * 進度面板訊息 ID
   */
  messageId: string;

  /**
   * 目標使用者 ID
   */
  targetUserId: string;

  /**
   * 執行者使用者 ID
   */
  executorId: string;

  /**
   * 任務起始時間
   */
  startedAt: Date;

  /**
   * 起始清理時間戳 (Date)
   */
  startDate: Date;

  /**
   * 結束清理時間戳 (Date)
   */
  endDate: Date;

  /**
   * 已刪除訊息總計
   */
  deletedCount: number;

  /**
   * 已掃描頻道計數
   */
  scannedChannels: number;

  /**
   * 待處理頻道總數
   */
  totalChannels: number;

  /**
   * 當前正在掃描的頻道名稱
   */
  currentChannelName: string;

  /**
   * 中斷旗標 (true 表示已觸發中斷)
   */
  isCancelled: boolean;
}
