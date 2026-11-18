/**
 * 論壇發帖通知模式
 * dm: 私訊通知指定身分組 (無 ping 按鈕)
 * channel: 於指定文字頻道發送文字消息艾特指定身分組並附帶帖子連結 Embed
 * none: 無任何通知 (僅貼文內自動發起投票)
 */
export type ForumPollMode = 'dm' | 'channel' | 'none';

/**
 * 操作動作：啟用/覆蓋 (on) 或 關閉 (off)
 */
export type ForumPollAction = 'on' | 'off';

/**
 * 論壇發帖自動投票與通知配置實體 (DAO / Entity)
 */
export interface IForumPollConfig {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 論壇頻道 ID */
  forumId: string;
  /** 是否啟用功能 */
  enabled: boolean;
  /** 通知模式 */
  mode: ForumPollMode;
  /** 目標通知身分組 ID (mode 為 dm 或 channel 時使用) */
  roleId?: string;
  /** 指定發送通知的文字頻道 ID (mode 為 channel 時使用) */
  notifyChannelId?: string;
  /** 更新時間戳 (ISO8601) */
  updatedAt: string;
}

/**
 * 建立/更新論壇自動投票配置傳入參數 (DTO)
 */
export interface IForumPollSetupDTO {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 論壇頻道 ID */
  forumId: string;
  /** 操作動作 */
  action: ForumPollAction;
  /** 通知模式 (action 為 on 時必填) */
  mode?: ForumPollMode;
  /** 目標通知身分組 ID */
  roleId?: string;
  /** 目標通知文字頻道 ID */
  notifyChannelId?: string;
}

/**
 * 私訊排隊發送任務項目 (用於每 5 分鐘發送 20 人的流控隊列)
 */
export interface IForumDmQueueItem {
  /** 隊列項目唯一識別碼 */
  id: string;
  /** 伺服器 Guild ID */
  guildId: string;
  /** 討論串 ID */
  threadId: string;
  /** 討論串名稱 */
  threadName: string;
  /** 討論串跳轉 URL */
  threadUrl: string;
  /** 待發送的成員 User ID 清單 */
  remainingUserIds: string[];
  /** 建立毫秒時間戳 */
  createdAt: number;
}
