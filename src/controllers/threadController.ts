import { Client, Events, ThreadChannel } from 'discord.js';
import { discordEventHandler } from '../utils/discordEventHandler';
import { vettingService } from '../services/vettingService';

/**
 * 監聽並處置 Discord 討論串/貼文建立事件 (Events.ThreadCreate)
 * 專責討論串、發帖事件監控與分發
 */
export async function handleThreadCreate(thread: ThreadChannel, isNew: boolean): Promise<void> {
  // 僅處理剛建立的新討論串/貼文
  if (!isNew) return;

  // 嘗試觸發 Vetting 自動化審核服務
  await vettingService.initVettingThread(thread);
}

/**
 * 註冊常駐 Thread 事件監聽控制器
 */
export const setupThreadController = (client: Client) => {
  client.on(
    Events.ThreadCreate,
    discordEventHandler('ThreadCreate', async (thread, isNew) => {
      if (thread instanceof ThreadChannel) {
        await handleThreadCreate(thread, isNew);
      }
    })
  );
};
