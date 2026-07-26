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
};
