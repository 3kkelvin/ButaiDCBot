import { Client, Events, GuildMember } from 'discord.js';
import { discordEventHandler } from '../utils/discordEventHandler';
import { welcomeService } from '../services/welcomeService';

/**
 * 處理新成員加入事件 (發送歡迎訊息與打招呼按鈕)
 */
export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  // 忽略機器人加入
  if (member.user.bot) {
    return;
  }

  await welcomeService.handleNewMember(member);
}

/**
 * 註冊常駐 GuildMemberAdd 事件監聽控制器
 */
export const setupGuildMemberAddController = (client: Client) => {
  client.on(
    Events.GuildMemberAdd,
    discordEventHandler('GuildMemberAdd', async (member) => {
      if (member instanceof GuildMember) {
        await handleGuildMemberAdd(member);
      }
    })
  );
};
