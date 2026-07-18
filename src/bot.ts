import './utils/otel'; // 必須在第一行載入，以啟用 OTel 自動插樁
import { Client, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import dotenv from 'dotenv';
import { pingCommand } from './controllers/pingCommand';
import { startHealthCheckServer } from './utils/healthCheckServer';
import { initSchedulers } from './utils/scheduler';
import { DiscordLogger } from './utils/discordLogger';
import { AppError } from './utils/appError';
import { trace } from '@opentelemetry/api';
import { initializeDatabase } from './utils/dbInit';
import dns from 'dns';
// 解決 Docker 容器中預設不支援 IPv6 導致的 ENETUNREACH 錯誤，強制全域優先連線 IPv4
dns.setDefaultResultOrder('ipv4first');

// 1. 載入環境變數
dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('[Fatal] 缺少環境變數 DISCORD_TOKEN 或 DISCORD_CLIENT_ID！');
  process.exit(1);
}

// 2. 初始化 Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// 3. 收集所有註冊指令
const commands = new Map<string, any>();
commands.set(pingCommand.data.name, pingCommand);

// 4. 當 Ready 時向 Discord 伺服器同步註冊 Slash Commands，並啟動健康檢查與排程
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Bot] 登入成功！當前帳號：${readyClient.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const commandData = Array.from(commands.values()).map((cmd) => cmd.data.toJSON());

    if (GUILD_ID) {
      console.log(`[Bot] 偵測到 GUILD_ID，將指令註冊至測試伺服器: ${GUILD_ID}`);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commandData,
      });
    } else {
      console.log('[Bot] 未偵測到 GUILD_ID，將指令註冊至全域 (可能需一小時生效)...');
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commandData,
      });
    }
    console.log('[Bot] Slash Commands 註冊同步成功！');
  } catch (error) {
    console.error('[Bot] Slash Commands 註冊同步失敗：', error);
  }

  // 執行資料庫自動建表與遷移
  await initializeDatabase();

  // 啟動健康檢查伺服器
  startHealthCheckServer(readyClient);

  // 初始化排程任務系統
  initSchedulers();
});

// 5. 監聽互動事件，並實現頂層非同步錯誤捕獲
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    console.error(`[Error] 找不到對應的指令處理器: ${interaction.commandName}`);
    return;
  }

  // 頂層全域錯誤捕獲區塊
  try {
    await command.execute(interaction);
  } catch (error: any) {
    console.error(`[Command Error] 執行指令 ${interaction.commandName} 時發生未預期異常:`, error);

    // 判斷是否為自定義的 AppError
    const isAppError = error instanceof AppError;
    const userMessage = isAppError 
      ? error.message 
      : '系統發生未知錯誤';

    // 系統級錯誤，自動觸發 Discord Webhook 報警
    if (!isAppError) {
      const activeSpan = trace.getActiveSpan();
      const traceId = activeSpan?.spanContext().traceId;

      await DiscordLogger.sendErrorLog({
        message: error.message || 'Unknown system error',
        errorName: error.name || 'SystemError',
        stack: error.stack,
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'local',
        traceId,
      }).catch((logErr) => {
        console.error('[Bot] 發送 Discord 錯誤報警失敗：', logErr.message, error.stack);
      });
    }

    // 回覆使用者錯誤狀態，若已 reply 則 followUp，否則直接 reply
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: userMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: userMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('[Bot Error] 回覆錯誤訊息時再度失敗：', replyError);
    }
  }
});

// 6. 登入 Discord
client.login(TOKEN).catch((err) => {
  console.error('[Fatal] 機器人登入失敗，請檢查 Token 是否正確：', err);
  process.exit(1);
});
