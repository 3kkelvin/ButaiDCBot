import './utils/otel'; // 必須在第一行載入，以啟用 OTel 自動插樁
import { Client, GatewayIntentBits, Events } from 'discord.js';
import dotenv from 'dotenv';
import { commandsMap } from './utils/commands';
import { handleBotInit } from './utils/botInit';
import { setupInteractionController } from './controllers/interactionController';
import { setupMessageController } from './controllers/messageController';
import { setupGuildMemberUpdateController } from './controllers/guildMemberUpdateController';
import dns from 'dns';

// 解決 Docker 容器中預設不支援 IPv6 導致的 ENETUNREACH 錯誤，強制全域優先連線 IPv4
dns.setDefaultResultOrder('ipv4first');

// 載入環境變數
dotenv.config();
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('[Fatal] 缺少環境變數 DISCORD_TOKEN！');
  process.exit(1);
}

// 初始化 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// 1. 當 Ready 時，執行一次性初始化與指令同步註冊
client.once(Events.ClientReady, (readyClient) => handleBotInit(readyClient, commandsMap));

// 2. 註冊常駐事件監聽器控制器
setupInteractionController(client);
setupMessageController(client);
setupGuildMemberUpdateController(client);

// 3. 登入 Discord
client.login(TOKEN).catch((err) => {
  console.error('[Fatal] 機器人登入失敗，請檢查 Token 是否正確：', err);
  process.exit(1);
});
