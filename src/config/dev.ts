import { ManualRoleRule } from '../models/role/manualRoleDTO';

/**
 * 開發與測試環境 (Dev Discord Server) 配置檔
 * 所有 Channel ID、Role ID、Guild ID 直接定義於此檔案中並進入 Git 版控。
 * 機密金鑰 (如 DISCORD_TOKEN, SUPABASE_KEY) 才放在 .env 中。
 */
export const devConfig = {
  guildId: '1527348832902316132', // 測試伺服器 Guild ID
  channels: {
    auditLog: '1527348842805334091', // 測試環境指令審計頻道 ID
    systemLog: '1527348841534197844', // 測試環境自動對話頻道 ID
    timeoutLog: '1531985028429643907', // 測試環境禁言/監獄紀錄頻道 ID
  },
  timeout: {
    defaultSingleLimitMinutes: 1440, // 單頻道禁言預設上限 (24小時)
    defaultGlobalLimitMinutes: 10080, // 全服監獄預設上限 (7天)
  },
  roles: {
    owner: '1527348833066025132', // 測試環境服主身分組 ID
    headAdmin: '1527348833066025131', // 測試環境大管理身分組 ID
    adminTag: '1527348833066025127', // 測試環境管理Tag身分組 ID
    civilTag: '1527348833049120916', // 測試環境公務Tag身分組 ID
    tech: '1527348833066025130', // 測試環境技術公務員身分組 ID
    voter: '1527348832965365961', // 選民 Role ID
    official: '1527348832965365960', // 正式成員 Role ID
    temporary: '1527348832965365959', // 臨時成員 Role ID
    special: '1527348832986202238', // 特殊人士 Role ID
    prisoner: '1527348833057771557', // 囚犯 Role ID
  },
  manualRoleRules: [
    {
      operatorRoleId: '1527348833040859253', // 申請審核員 ID
      allowedRoleIds: ['1527348832965365961', '1527348832965365960', '1527348832965365959'], // 可給予/移除：選民、正式成員、臨時成員
      description: '申請審核員手動給予/移除選民、正式成員、臨時成員身分組權限',
    },
    {
      operatorRoleId: '1527348833057771554', // 臺灣頻道管理 ID
      allowedRoleIds: ['1527348832902316135', '1527348832902316140'], // 可給予/移除：臺灣公民、對台灣區特殊開放
      description: '臺灣頻道管理手動給予/移除臺灣公民、對台灣區特殊開放身分組權限',
    },
  ] as ManualRoleRule[],
  threadAutoClose: {
    enabled: true,
    inactiveTimeoutSeconds: 86400, // 24 小時無訊息則自動歸檔 (單位: 秒)
    excludedTagIds: ['1527348840540405854'] as string[], // 豁免標籤 ID 列表 (帶有這些 Tag 的貼文跳過不關閉)
  },
  vetting: {
    officialVettingForum: '1527348842150756542', // 測試環境正式成員審核論壇 ID
    voterVettingForum: '1527348842150756538', // 測試環境選民審核論壇 ID
    voterRequiredApprovals: 3, // 選民審核設定的通過票數
    reviewTimeoutDays: 1, // 審核有效天數 (預設 7 天)
    reviewerRoleId: '1527348833040859253', // 申請審核員 Role ID
  },
};
