import { Channel } from 'discord.js';

/**
 * 訊息回頂定位傳入參數 (DTO)
 */
export interface IBackToTopDTO {
  /** 目標文字頻道、貼文或子區實例 (若未提供則預設為當前頻道) */
  channel: Channel | null;
  /** 定位進度百分比 (例如: 50, 50%，預設 100%) */
  progress?: string | null;
}
