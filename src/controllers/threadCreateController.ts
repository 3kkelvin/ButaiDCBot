import { AnyThreadChannel, Client, Events } from 'discord.js';
import { discordEventHandler } from '../utils/discordEventHandler';
import { forumPollService } from '../services/forumPollService';

/**
 * 處理 ThreadCreate 事件 (論壇新貼文自動發起投票與通知)
 */
export async function handleThreadCreate(thread: AnyThreadChannel, newlyCreated: boolean): Promise<void> {
  // 僅處理全新建立的討論串，避免歷史討論串加載重覆觸發
  if (newlyCreated === false) {
    return;
  }

  await forumPollService.handleNewForumThread(thread);
}

/**
 * 註冊常駐 ThreadCreate 事件監聽控制器
 */
export const setupThreadCreateController = (client: Client) => {
  client.on(
    Events.ThreadCreate,
    discordEventHandler('ThreadCreate', async (thread, newlyCreated) => {
      await handleThreadCreate(thread, Boolean(newlyCreated));
    })
  );
};
