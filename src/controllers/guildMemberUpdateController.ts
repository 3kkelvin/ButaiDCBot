import { Client, Events, GuildMember } from 'discord.js';
import { discordEventHandler } from '../utils/discordEventHandler';
import { roleDividerService } from '../services/roleDividerService';

/**
 * 處理 GuildMemberUpdate 事件的業務邏輯
 */
export async function handleGuildMemberUpdate(
  oldMember: GuildMember,
  newMember: GuildMember
): Promise<void> {
  // 檢查身分組是否有變動，若沒有異動則跳過
  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());

  const hasRoleChange =
    oldRoleIds.size !== newRoleIds.size ||
    Array.from(oldRoleIds).some((id) => !newRoleIds.has(id));

  if (!hasRoleChange) {
    return;
  }

  // 觸發 RoleDivider 身分組分隔線自動修復
  await roleDividerService.fixMemberRoles(newMember);
}

/**
 * 註冊常駐 GuildMemberUpdate 事件監聽控制器
 */
export const setupGuildMemberUpdateController = (client: Client) => {
  client.on(
    Events.GuildMemberUpdate,
    discordEventHandler('GuildMemberUpdate', async (oldMember, newMember) => {
      // 確保取得正確的 GuildMember 實例
      if (oldMember instanceof GuildMember && newMember instanceof GuildMember) {
        await handleGuildMemberUpdate(oldMember, newMember);
      }
    })
  );
};
