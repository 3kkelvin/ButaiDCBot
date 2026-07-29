import { Client, Events, Message } from 'discord.js';
import { discordEventHandler } from '../utils/discordEventHandler';

/**
 * 處理並過濾文字訊息
 * @param message Discord 訊息實例
 */
export async function handleMessage(message: Message): Promise<void> {
  // 1. 防禦性過濾：如果是機器人自己發的訊息，直接跳過防死循環
  if (message.author.bot) {
    return;
  }

  const content = message.content;
  const authorTag = message.author.tag;

  // 2. 範例：關鍵字 (髒話/敏感詞) 屏蔽與提醒
  const sensitiveKeywords = ['幹', '機車', 'joyce'];
  const hasSensitiveWord = sensitiveKeywords.some((keyword) => content.includes(keyword));

  if (hasSensitiveWord) {
    return;
  }

  // 3. 範例：URL 連結安全警告與處理
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  if (urlRegex.test(content)) {
    // 預留：未來的 URL 連結安全警告與處理邏輯
  }
}

/**
 * 監聽並處置 Discord 普通文字訊息事件 (Events.MessageCreate)
 * 負責註冊監聽與安全過濾分流
 */
export const setupMessageController = (client: Client) => {
  client.on(
    Events.MessageCreate,
    discordEventHandler('MessageCreate', async (message) => {
      await handleMessage(message);
    })
  );
};
