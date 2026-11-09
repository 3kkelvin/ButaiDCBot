/**
 * 論壇發帖自動投票與通知配置介面 (DAO / Entity)
 */
export interface IForumPollConfig {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 論壇頻道 ID */
  forumId: string;
  /** 目標通知身分組 ID */
  roleId: string;
  /** 是否開啟免打擾按鈕 (true: 提供按鈕可永不打擾 ; false: 僅發通知不帶按鈕) */
  ping: boolean;
  /** 更新時間戳 (ISO8601) */
  updatedAt: string;
}

/**
 * 建立論壇自動投票配置之傳入參數 (DTO)
 */
export interface IForumPollSetupDTO {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 論壇頻道 ID */
  forumId: string;
  /** 目標通知身分組 ID */
  roleId: string;
  /** 是否開啟免打擾按鈕 */
  ping: boolean;
}
