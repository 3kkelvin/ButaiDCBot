import { EmbedBuilder, Guild } from 'discord.js';
import { config } from '../config';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';

export interface IIdentityCheckResult {
  totalMembers: number;
  processedMembers: number;
  addedTemporaryCount: number;
  conflictResolvedCount: number;
}

/**
 * 5 大身分組優先權權重定義 (陣列前方優先權較高)
 * 選民 (voter) > 正式成員 (official) > 臨時成員 (temporary) > 特殊人士 (special) > 囚犯 (prisoner)
 */
const ROLE_PRIORITY_KEYS = ['voter', 'official', 'temporary', 'special', 'prisoner'] as const;

/**
 * 核心身分組管理業務服務 (BLL)
 */
export class RoleService {
  /**
   * 執行全伺服器身分核對檢查
   * 1. 完全無 5 大身分者，自動給予「臨時成員」
   * 2. 同時擁有複數 5 大身分者，依照權重僅保留最高位階者
   * 
   * @param guild Discord 伺服器實例
   */
  public async identityCheck(guild: Guild): Promise<IIdentityCheckResult> {
    const lockKey = RedisKeys.Lock.identityCheck(guild.id);

    return await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 60000,
        releaseOnSuccess: true,
      },
      async () => {
        // 讀取 config 中配置的身分組 ID
        const configuredRoles = {
          voter: config.roles.voter,
          official: config.roles.official,
          temporary: config.roles.temporary,
          special: config.roles.special,
          prisoner: config.roles.prisoner,
        };

        // 有效的身分組 ID 映射與反向 ID->Key 字典
        const validRoleIdsSet = new Set<string>();
        const idToKeyMap = new Map<string, typeof ROLE_PRIORITY_KEYS[number]>();

        for (const key of ROLE_PRIORITY_KEYS) {
          const roleId = configuredRoles[key];
          if (roleId) {
            validRoleIdsSet.add(roleId);
            idToKeyMap.set(roleId, key);
          }
        }

        const temporaryRoleId = configuredRoles.temporary;

        // 全服成員取得
        const membersCollection = await guild.members.fetch();
        const members = Array.from(membersCollection.values());

        let addedTemporaryCount = 0;
        let conflictResolvedCount = 0;

        for (const member of members) {
          if (member.user.bot) continue;

          const currentRoleIds = new Set(member.roles.cache.keys());
          const targetRoleIds = new Set(currentRoleIds);

          // 找出該成員目前擁有的 5 大身分組 key 列表
          const ownedRoleKeys: { key: typeof ROLE_PRIORITY_KEYS[number]; id: string }[] = [];
          for (const roleId of currentRoleIds) {
            const key = idToKeyMap.get(roleId);
            if (key) {
              ownedRoleKeys.push({ key, id: roleId });
            }
          }

          let isUpdated = false;

          if (ownedRoleKeys.length === 0) {
            // 情境 A：完全沒有 5 大身分組 -> 賦予臨時成員
            if (temporaryRoleId) {
              targetRoleIds.add(temporaryRoleId);
              addedTemporaryCount++;
              isUpdated = true;
            }
          } else if (ownedRoleKeys.length > 1) {
            // 情境 B：同時擁有 2 個或以上 5 大身分組 -> 按優先權僅保留最高者
            // 尋找最高優先權的 key (在 ROLE_PRIORITY_KEYS 索引最小者)
            let highestItem = ownedRoleKeys[0];
            let highestIndex = ROLE_PRIORITY_KEYS.indexOf(highestItem.key);

            for (let i = 1; i < ownedRoleKeys.length; i++) {
              const item = ownedRoleKeys[i];
              const idx = ROLE_PRIORITY_KEYS.indexOf(item.key);
              if (idx < highestIndex) {
                highestItem = item;
                highestIndex = idx;
              }
            }

            // 移除其餘較低優先權的身分組
            for (const item of ownedRoleKeys) {
              if (item.id !== highestItem.id) {
                targetRoleIds.delete(item.id);
              }
            }

            conflictResolvedCount++;
            isUpdated = true;
          }

          // 若有改變且涉及可編輯的身分組，進行一次性 API 覆寫
          if (isUpdated) {
            console.log(`[RoleService] 為成員 ${member.user.tag} 執行身分核對更新`);
            await member.roles.set(Array.from(targetRoleIds));
          }
        }

        return {
          totalMembers: members.length,
          processedMembers: members.filter((m) => !m.user.bot).length,
          addedTemporaryCount,
          conflictResolvedCount,
        };
      }
    );
  }

  /**
   * 執行身分核對並組裝結果 Embed (給表現層 Controller 使用)
   * 
   * @param guild Discord 伺服器實例
   */
  public async getIdentityCheckEmbed(guild: Guild): Promise<EmbedBuilder> {
    const result = await this.identityCheck(guild);

    return new EmbedBuilder()
      .setTitle('身分組核對檢查報告 (Identity Check)')
      .setColor(0x3498db)
      .setDescription('已完成全伺服器成員身分層級檢核與修正！')
      .addFields(
        { name: '總成員數 (含機器人)', value: `${result.totalMembers} 人`, inline: true },
        { name: '已處理真人成員', value: `${result.processedMembers} 人`, inline: true },
        { name: '新增「臨時成員」人數', value: `${result.addedTemporaryCount} 人`, inline: false },
        { name: '修正多重身分衝突人數', value: `${result.conflictResolvedCount} 人`, inline: false }
      )
      .setFooter({ text: '預設優先權：選民 > 正式成員 > 臨時成員 > 特殊人士 > 囚犯' })
      .setTimestamp();
  }
}

export const roleService = new RoleService();
