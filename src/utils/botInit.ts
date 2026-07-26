import { Client, REST, Routes } from 'discord.js';
import { initializeDatabase } from './dbInit';
import { startHealthCheckServer } from './healthCheckServer';
import { initSchedulers } from './scheduler';

/**
 * 同步 Slash Commands 指令至 Discord API
 * @param readyClient 登入成功的 Client 實例
 * @param commands 所有已註冊的指令 Map
 */
export async function syncSlashCommands(readyClient: Client, commands: Map<string, any>): Promise<void> {
  const TOKEN = process.env.DISCORD_TOKEN;
  const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const GUILD_ID = process.env.DISCORD_GUILD_ID;

  if (!TOKEN || !CLIENT_ID) {
    console.error('[BotInit] 缺少環境變數 DISCORD_TOKEN 或 DISCORD_CLIENT_ID，跳過指令註冊！');
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const commandData = Array.from(commands.values()).map((cmd) => cmd.data.toJSON());

    if (GUILD_ID) {
      console.log(`[BotInit] 偵測到 GUILD_ID，將指令註冊至測試伺服器: ${GUILD_ID}`);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commandData,
      });
    } else {
      console.log('[BotInit] 未偵測到 GUILD_ID，將指令註冊至全域 (可能需一小時生效)...');
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commandData,
      });
    }
    console.log('[BotInit] Slash Commands 註冊同步成功！');
  } catch (error) {
    console.error('[BotInit] Slash Commands 註冊同步失敗：', error);
  }
}

/**
 * 處理 Ready 階段的一性次初始化工作
 * @param readyClient 登入成功的 Client 實例
 * @param commands 所有已註冊的指令 Map
 */
export async function handleBotInit(readyClient: Client, commands: Map<string, any>): Promise<void> {
  console.log(`[BotInit] 登入成功！當前帳號：${readyClient.user?.tag}`);

  // 1. 同步 Slash Commands
  await syncSlashCommands(readyClient, commands);

  // 2. 執行資料庫自動建表與遷移 (偵測並建立 caches、distributed_locks 表)
  try {
    await initializeDatabase();
  } catch (dbError) {
    console.error('[BotInit] 資料庫初始化失敗，Bot 繼續運行但部分 DB 操作可能出錯：', dbError);
  }

  // 3. 啟動健康檢查伺服器
  startHealthCheckServer(readyClient);

  // 4. 初始化排程任務系統
  initSchedulers();
}
