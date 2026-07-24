import { EmbedBuilder, Guild, Role } from 'discord.js';
import { config } from '../config';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import { RoleUtils } from '../utils/roleUtils';
import discordRepository from '../repositories/discordRepository';

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
        const membersCollection = await discordRepository.getGuildMembers(guild);
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

  /**
   * 取得伺服器公職與管理人員列表 Embed
   * 
   * 排序順序：
   * 1. 服主
   * 2. 大管理
   * 3. 技術公務員
   * 4. 管理身分組（位在 adminTag 下方，直到第一個裝飾身分組）
   * 5. 公務身分組（位在 civilTag 下方，直到第一個裝飾身分組）
   * 
   * 格式：身分組名字：人員名字A、B
   * 
   * @param guild Discord 伺服器實例
   */
  public async getPositionListEmbed(guild: Guild): Promise<EmbedBuilder> {
    const membersCollection = await discordRepository.getGuildMembers(guild);
    const allMembers = Array.from(membersCollection.values()).filter((m) => !m.user.bot);

    // 取得所有身分組，並依據 position 降冪排序 (最高位階在最前面)
    const sortedRoles = Array.from(guild.roles.cache.values()).sort(
      (a, b) => b.position - a.position
    );

    // 取得指定固定身分組 ID
    const ownerRoleId = config.roles.owner;
    const headAdminRoleId = config.roles.headAdmin;
    const techRoleId = config.roles.tech;
    const adminTagRoleId = config.roles.adminTag;
    const civilTagRoleId = config.roles.civilTag;

    // 1. 固定三項身分組的角色 ID 集合
    const fixedRoleIds = [ownerRoleId, headAdminRoleId, techRoleId].filter(Boolean);
    const fixedRoleSet = new Set(fixedRoleIds);

    // 2. 搜尋「管理身分組」範圍：位於 adminTag 之下，直至第一個 Divider Role 止
    const adminRoles: Role[] = [];
    if (adminTagRoleId) {
      const adminTagIdx = sortedRoles.findIndex((r) => r.id === adminTagRoleId);
      if (adminTagIdx !== -1) {
        for (let i = adminTagIdx + 1; i < sortedRoles.length; i++) {
          const role = sortedRoles[i];
          if (RoleUtils.isDividerRole(role.name)) {
            break;
          }
          if (role.id !== guild.id && !fixedRoleSet.has(role.id)) {
            adminRoles.push(role);
          }
        }
      }
    }

    // 3. 搜尋「公務身分組」範圍：位於 civilTag 之下，直至第一個 Divider Role 止
    const civilRoles: Role[] = [];
    if (civilTagRoleId) {
      const civilTagIdx = sortedRoles.findIndex((r) => r.id === civilTagRoleId);
      if (civilTagIdx !== -1) {
        for (let i = civilTagIdx + 1; i < sortedRoles.length; i++) {
          const role = sortedRoles[i];
          if (RoleUtils.isDividerRole(role.name)) {
            break;
          }
          if (role.id !== guild.id && !fixedRoleSet.has(role.id)) {
            civilRoles.push(role);
          }
        }
      }
    }

    const formatRoleLine = (roleId: string | undefined): string | null => {
      if (!roleId) return null;
      const role = guild.roles.cache.get(roleId);
      if (!role) return null;

      const members = allMembers.filter((m) => m.roles.cache.has(role.id));
      const names = members.map((m) => `<@${m.id}>`).join('、');
      return `<@&${role.id}>：${names || '無'}`;
    };

    const lines: string[] = [];

    // 固定順序 1: 服主
    const ownerLine = formatRoleLine(ownerRoleId);
    if (ownerLine) lines.push(ownerLine);

    // 固定順序 2: 大管理
    const headAdminLine = formatRoleLine(headAdminRoleId);
    if (headAdminLine) lines.push(headAdminLine);

    // 固定順序 3: 技術公務員
    const techLine = formatRoleLine(techRoleId);
    if (techLine) lines.push(techLine);
    
    // 固定順序 4: 管理身分組底下的依序排（管理身分組前空一行）
    lines.push(''); // 空一行
    const adminHeader = adminTagRoleId ? `<@&${adminTagRoleId}>：` : '管理身分組：';
    lines.push(adminHeader);
    for (const role of adminRoles) {
      const members = allMembers.filter((m) => m.roles.cache.has(role.id));
      const names = members.map((m) => `<@${m.id}>`).join('、');
      lines.push(`<@&${role.id}>：${names || '無'}`);
    }

    // 固定順序 5: 公務身分組底下的依序排（公務身分組前空一行）
    lines.push(''); // 空一行
    const civilHeader = civilTagRoleId ? `<@&${civilTagRoleId}>：` : '公務身分組：';
    lines.push(civilHeader);
    for (const role of civilRoles) {
      const members = allMembers.filter((m) => m.roles.cache.has(role.id));
      const names = members.map((m) => `<@${m.id}>`).join('、');
      lines.push(`<@&${role.id}>：${names || '無'}`);
    }

    const descriptionText = lines.length > 0 ? lines.join('\n') : '尚未設定或找不到任何公職身分組資料。';

    return new EmbedBuilder()
      .setTitle('伺服器公職人員列表')
      .setColor(0x00aeef)
      .setDescription(descriptionText)
      .setTimestamp();
  }
}

export const roleService = new RoleService();

