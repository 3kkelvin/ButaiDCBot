import { Client, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import dotenv from 'dotenv';
import { pingCommand } from './controllers/pingCommand';
import { startHealthCheckServer } from './utils/healthCheckServer';

// 1. 載入環境變數
dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('[Fatal] 缺少環境變數 DISCORD_TOKEN 或 DISCORD_CLIENT_ID！');
  process.exit(1);
}

// 2. 初始化 Discord Client (Intents 僅宣告基礎所需的 Guilds)
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// 3. 收集所有註冊指令
const commands = new Map<string, any>();
commands.set(pingCommand.data.name, pingCommand);

// 4. 當 Ready 時向 Discord 伺服器同步註冊 Slash Commands，並啟動本地健康檢查
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

  // 啟動健康檢查伺服器
  startHealthCheckServer(readyClient);
});

// 5. 監聽互動事件，並實現頂層非同步錯誤捕獲 (asyncHandler 精神)
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

    // 判斷是否為自定義的 AppError (AppError 通常有 message 與 code/status，中期引入)
    const isAppError = error.constructor.name === 'AppError' || (error.message && !error.stack?.includes('TypeError') && !error.stack?.includes('ReferenceError'));
    const userMessage = isAppError 
      ? error.message 
      : '❌ 系統發生未知錯誤，已通知開發團隊處理。';

    // 系統級錯誤，後續將自動觸發 Discord Webhook 報警 (discordLogger)
    if (!isAppError) {
      console.log(`[Alarm] 系統級錯誤已捕獲，準備發送報警。Trace Stack:\n`, error.stack);
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
