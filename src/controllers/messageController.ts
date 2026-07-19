import { Message } from 'discord.js';

/**
 * 伺服器文字訊息過濾與攔截控制器 (Presentation Layer)
 * 
 * 負責處理 MessageCreate 事件，對所有進站的普通文字訊息進行關鍵字審查、網址過濾與格式轉換。
 */
export class MessageController {
  
  /**
   * 處理並過濾文字訊息
   * @param message Discord 訊息實例
   */
  public async handleMessage(message: Message): Promise<void> {
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
        content: `🙊 溫馨提醒 **@${message.author.username}**，聊天時請保持發言禮貌喔！`,
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
}

// 導出控制器單例
export const messageController = new MessageController();
