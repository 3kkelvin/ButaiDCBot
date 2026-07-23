/**
 * 正式與生產環境 (Main Discord Server) 配置檔
 * 所有 Channel ID、Role ID、Guild ID 直接定義於此檔案中並進入 Git 版控。
 * 機密金鑰 (如 DISCORD_TOKEN, SUPABASE_KEY) 才放在 .env 中。
 */
export const mainConfig = {
  guildId: '1150630510696075404', // 大舞台正式伺服器 Guild ID
  channels: {
    auditLog: '1166627731916734504', // 正式環境指令審計頻道 ID
    systemLog: '1299458193507881051', // 正式環境自動對話頻道 ID
  },
  roles: {
    tech: '1200100104682614884', // 正式環境技術公務員身分組 ID
    voter: '1200043628899356702', // 選民 Role ID
    official: '1282944839679344721', // 正式成員 Role ID
    temporary: '1164761892015833129', // 臨時成員 Role ID
    special: '1471914157203783793', // 特殊人士 Role ID
    prisoner: '1247284720044085370', // 囚犯 Role ID
  },
};
