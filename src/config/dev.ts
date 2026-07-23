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
    tech: '1527348833066025130', // 測試環境技術人員身分組 ID
  },
};
