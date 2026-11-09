/**
 * 工單頻道與接收身分組配置介面 (DAO / Entity)
 */
export interface ITicketConfig {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 工單面板文字頻道 ID */
  channelId: string;
  /** 接收工單通知與管理之身分組 ID 陣列 */
  roleIds: string[];
  /** 配置更新時間戳 (ISO8601) */
  updatedAt: string;
}

/**
 * 工單私人子區建立記錄介面 (DAO / Entity)
 */
export interface ITicketThreadRecord {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 父級文字頻道 ID */
  channelId: string;
  /** 私人子區 Thread ID */
  threadId: string;
  /** 開票人 User ID */
  creatorId: string;
  /** 允許管理與接收通知的身分組 ID 陣列 */
  roleIds: string[];
  /** 建立時間戳 (ISO8601) */
  createdAt: string;
}

/**
 * 建立工單面板傳入參數 (DTO)
 */
export interface ITicketSetupDTO {
  /** 伺服器 Guild ID */
  guildId: string;
  /** 工單面板文字頻道 ID */
  channelId: string;
  /** 指定身分組 ID 陣列 */
  roleIds: string[];
}
