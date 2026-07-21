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
  const sensitiveKeywords = ['幹', '機車', '垃圾'];
  const hasSensitiveWord = sensitiveKeywords.some(keyword => content.includes(keyword));
  
  if (hasSensitiveWord) {
    console.log(`[MessageFilter] ⚠️ 偵測到用戶 ${authorTag} 發送敏感詞: "${content}"`);
    
    // 可以回覆提醒，或在真實環境執行 message.delete() 刪除訊息
    await message.reply({ 
      content: `🙊 溫馨提醒 <@${message.author.id}> ，聊天時請保持發言禮貌喔！`,
      allowedMentions: { repliedUser: true }
    });
    return;
  }

  // 3. 範例：URL 連結安全警告與處理
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  if (urlRegex.test(content)) {
    console.log(`[MessageFilter] 🌐 偵測到用戶 ${authorTag} 發送外部連結: "${content}"`);
    
    // 未來可在這裡接入網址縮網址服務、或將特定 URL 轉換成專屬網頁形式
    // 這裡僅進行簡單的防詐騙安全提示
    await message.react('⚠️').catch(() => {});
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
