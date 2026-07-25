import { EmbedBuilder, Guild, GuildMember, PermissionFlagsBits, Role } from 'discord.js';
import { config } from '../config';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import { RoleUtils } from '../utils/roleUtils';
import { PermissionGuard } from '../utils/permissionGuard';
import { AppError } from '../utils/appError';
import discordRepository from '../repositories/discordRepository';
import socialCreditRepository from '../repositories/socialCreditRepository';
import { ISocialCreditLog } from '../models/db/socialCreditLog';
import { IIdentityCheckDTO } from '../models/role/identityCheckDTO';
import { IDemeritDTO } from '../models/role/demeritDTO';

/**
 * 5 大身分組優先權權重定義 (陣列前方優先權較高)
 * 選民 (voter) > 正式成員 (official) > 臨時成員 (temporary) > 特殊人士 (special) > 囚犯 (prisoner)
 */
const ROLE_PRIORITY_KEYS = ['voter', 'official', 'temporary', 'special', 'prisoner'] as const;

/**
   * 公務員社群信用初始基礎分數
   */
const INITIAL_SOCIAL_CREDIT_SCORE = 6;

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
  public async identityCheck(guild: Guild): Promise<IIdentityCheckDTO> {
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
   * 計算指定成員在伺服器的即時社群信用總點數
   */
  public async getUserSocialCreditScore(guildId: string, targetUserId: string): Promise<number> {
    let score = INITIAL_SOCIAL_CREDIT_SCORE;
    const logs = await socialCreditRepository.getLogsByUser(guildId, targetUserId);
    for (const log of logs) {
      score += log.is_add ? log.points : -log.points;
    }
    return score;
  }

  /**
   * 批次計算多名成員在伺服器的即時社群信用總點數 Map
   */
  public async getBatchUserSocialCreditScores(guildId: string, targetUserIds: string[]): Promise<Map<string, number>> {
    const scoreMap = new Map<string, number>();
    if (targetUserIds.length === 0) return scoreMap;

    // 1. 全員預設為業務初始分數
    for (const id of targetUserIds) {
      scoreMap.set(id, INITIAL_SOCIAL_CREDIT_SCORE);
    }

    // 2. 獲取 DAL 的原始日誌並套用業務計算規則
    const logs = await socialCreditRepository.getLogsByUsers(guildId, targetUserIds);
    for (const log of logs) {
      const current = scoreMap.get(log.target_user_id) ?? INITIAL_SOCIAL_CREDIT_SCORE;
      const diff = log.is_add ? log.points : -log.points;
      scoreMap.set(log.target_user_id, current + diff);
    }

    return scoreMap;
  }

  /**
   * 取得伺服器公職與管理人員列表 Embed (含公務員計點分數顯示)
   * 
   * 排序順序：
   * 1. 服主
   * 2. 大管理
   * 3. 技術公務員
   * 4. 管理身分組（位在 adminTag 下方，直到第一個裝飾身分組）
   * 5. 公務身分組（位在 civilTag 下方，直到第一個裝飾身分組）
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

    // 僅查詢擁有 adminTag 身分組的管理人員點數
    const adminMembers = allMembers.filter((m) => PermissionGuard.hasRole(m, adminTagRoleId));
    const adminMemberIds = adminMembers.map((m) => m.id);
    const scoreMap = await this.getBatchUserSocialCreditScores(guild.id, adminMemberIds);

    // 普通身分組格式化 (不計算點數)
    const formatNormalRoleLines = (roleId: string | undefined): string[] => {
      if (!roleId) return [];
      const role = guild.roles.cache.get(roleId);
      if (!role) return [];

      const members = allMembers.filter((m) => m.roles.cache.has(role.id));
      const names = members.map((m) => `<@${m.id}>`).join('、');
      return [`<@&${role.id}>：${names || '無'}`];
    };

    // 格式化管理身分組人員 (計算點數，單人同列，多人一人一行)
    const formatAdminRoleLines = (role: Role): string[] => {
      const members = allMembers.filter((m) => m.roles.cache.has(role.id));
      if (members.length === 0) {
        return [`<@&${role.id}>：無`];
      }

      if (members.length === 1) {
        const m = members[0];
        const hasAdminTag = PermissionGuard.hasRole(m, adminTagRoleId);
        const scoreStr = hasAdminTag
          ? ` (${scoreMap.get(m.id) ?? INITIAL_SOCIAL_CREDIT_SCORE}分)`
          : '';
        return [`<@&${role.id}>：<@${m.id}>${scoreStr}`];
      }

      // 多人：改為一人一行
      const roleLines: string[] = [`<@&${role.id}>：`];
      members.forEach((m, idx) => {
        const hasAdminTag = PermissionGuard.hasRole(m, adminTagRoleId);
        const scoreStr = hasAdminTag
          ? ` (${scoreMap.get(m.id) ?? INITIAL_SOCIAL_CREDIT_SCORE}分)`
          : '';
        const prefix = idx === members.length - 1 ? '└' : '├';
        roleLines.push(`${prefix} <@${m.id}>${scoreStr}`);
      });
      return roleLines;
    };

    const lines: string[] = [];

    // 固定順序 1: 服主
    lines.push(...formatNormalRoleLines(ownerRoleId));

    // 固定順序 2: 大管理
    lines.push(...formatNormalRoleLines(headAdminRoleId));

    // 固定順序 3: 技術公務員
    lines.push(...formatNormalRoleLines(techRoleId));

    // 固定順序 4: 管理身分組底下的依序排（管理身分組前空一行）
    lines.push(''); // 空一行
    const adminHeader = adminTagRoleId ? `<@&${adminTagRoleId}>：` : '管理身分組：';
    lines.push(adminHeader);
    for (const role of adminRoles) {
      lines.push(...formatAdminRoleLines(role));
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

  /**
   * 執行公務員加減分/記點處分 (Demerit 核心邏輯)
   */
  public async demerit(
    guild: Guild,
    executor: GuildMember,
    target: GuildMember,
    action: 'add' | 'deduct',
    points: number,
    reason: string
  ): Promise<IDemeritDTO> {
    // 1. 分數數值驗證 (最多 6 分)
    if (!Number.isInteger(points) || points < 1 || points > 6) {
      throw new AppError('分數加減異動值必須為 1 至 6 之間的整數！', 400);
    }

    // 2. 被處分者必須擁有 adminTag 身分組
    const adminTagRoleId = config.roles.adminTag;
    if (!PermissionGuard.hasRole(target, adminTagRoleId)) {
      throw new AppError('被處分的對象必須是管理身分！', 400);
    }

    const isOwner = PermissionGuard.hasRole(executor, config.roles.owner);
    const isAdd = action === 'add';

    // 3. 加分權限檢查：僅 Owner 可執行
    if (isAdd) {
      if (!isOwner) {
        throw new AppError('權限不足：只有服主可以執行加分操作！', 403);
      }
    } else {
      // 4. 減分權限檢查：必須為伺服器管理員 (Administrator 權限)
      const isServerAdmin = executor.permissions.has(PermissionFlagsBits.Administrator);
      if (!isServerAdmin) {
        throw new AppError('權限不足：您必須擁有伺服器管理員權限才能執行減分操作！', 403);
      }

      // 減分階級限制：只能操作 adminTag 裝飾身分組以外、身分組排序比自己低的人
      const executorMaxPos = this.getHighestEffectiveRolePosition(executor);
      const targetMaxPos = this.getHighestEffectiveRolePosition(target);
      if (targetMaxPos >= executorMaxPos) {
        throw new AppError('權限不足：您只能操作身分組排序比自己低的人！', 403);
      }
      
    }

    // 5. 寫入 DB Log
    const newLog = await socialCreditRepository.addLog({
      guild_id: guild.id,
      target_user_id: target.id,
      executor_user_id: executor.id,
      is_add: isAdd,
      points,
      reason,
    });

    // 6. 現場計算最新即時點數 (BLL 計算)
    const newScore = await this.getUserSocialCreditScore(guild.id, target.id);

    // 7. 扣分處罰處置：扣至 0 分或更低時，拔除 adminTag 及所有 adminTag 類管理身分組
    const removedRoles: Role[] = [];
    if (newScore <= 0) {
      const adminCategoryRoleIds = this.getAdminCategoryRoleIds(guild);
      for (const roleId of adminCategoryRoleIds) {
        if (target.roles.cache.has(roleId)) {
          const roleObj = guild.roles.cache.get(roleId);
          if (roleObj) removedRoles.push(roleObj);
        }
      }

      if (removedRoles.length > 0) {
        console.log(
          `[RoleService] 成員 ${target.user.tag} 點數歸零 (${newScore}分)，自動拔除 ${removedRoles.length} 個管理身分組`
        );
        await target.roles.remove(removedRoles.map((r) => r.id));
      }
    }

    return {
      log: newLog,
      newScore,
      removedRoles,
    };
  }

  /**
   * 執行處分並組裝發布紀錄 Embed
   */
  public async getDemeritEmbed(
    guild: Guild,
    executorUserId: string,
    targetUserId: string,
    action: 'add' | 'deduct',
    points: number,
    reason: string
  ): Promise<EmbedBuilder> {
    const executor = await guild.members.fetch(executorUserId);
    const target = await guild.members.fetch(targetUserId);

    const result = await this.demerit(guild, executor, target, action, points, reason);

    const actionText = action === 'add' ? `**加分 +${points}**` : `**扣分 -${points}**`;
    const embed = new EmbedBuilder()
      .setTitle('公務員SocialCredit紀錄')
      .setColor(action === 'add' ? 0x2ecc71 : 0xe74c3c)
      .addFields(
        { name: '加扣分對象', value: `<@${target.id}>`, inline: true },
        { name: '異動項目', value: actionText, inline: true },
        { name: '更新後總分數', value: `**${result.newScore}** 分`, inline: true },
        { name: '操作者', value: `<@${executor.id}>`, inline: false },
        { name: '理由說明', value: reason, inline: false }
      )
      .setTimestamp();

    if (result.removedRoles.length > 0) {
      const roleNames = result.removedRoles.map((r) => `<@&${r.id}>`).join('、');
      embed.addFields({
        name: '⚠️ 身分組懲處解任通知',
        value: `該成員點數已降至 **${result.newScore}** 分 (<= 0)，已自動拔除其 adminTag 及以下管理身分組：\n${roleNames}`,
      });
    }

    return embed;
  }

  /**
   * 取得個人社群信用 (Social Credit) 點數與紀錄 Embed
   */
  public async getSocialCreditEmbed(
    guild: Guild,
    targetUserId: string
  ): Promise<EmbedBuilder> {
    const target = await guild.members.fetch(targetUserId);
    const logs = await socialCreditRepository.getLogsByUser(guild.id, target.id);

    const embed = new EmbedBuilder()
      .setTitle(`公務員SocialCredit - ${target.displayName}`)
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    if (logs.length === 0) {
      embed
        .setColor(0x95a5a6)
        .setDescription('尚無任何紀錄或不適用SocialCredit系統');
    } else {
      const score = await this.getUserSocialCreditScore(guild.id, target.id);
      embed
        .setColor(score > 3 ? 0x2ecc71 : score > 0 ? 0xf1c40f : 0xe74c3c)
        .addFields({
          name: `當前總點數 (初始 ${INITIAL_SOCIAL_CREDIT_SCORE} 分)`,
          value: `**${score}** 分`,
          inline: false,
        });

      // 顯示最近最多 10 筆紀錄
      const recentLogs = logs.slice(0, 10);
      const logLines = recentLogs.map((log, idx) => {
        const timeStr = log.created_at
          ? `<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:R>`
          : '未知時間';
        const actionStr = log.is_add ? `加 **${log.points}** 分` : `扣 **${log.points}** 分`;
        return `${idx + 1}. ${actionStr} (${timeStr}) - 執行者: <@${log.executor_user_id}>\n   理由: ${log.reason}`;
      });

      embed.addFields({
        name: `歷史異動紀錄 (最新 ${recentLogs.length} 筆)`,
        value: logLines.join('\n\n'),
      });
    }

    return embed;
  }

  /**
   * 重置全伺服器公務員社群信用點數紀錄
   */
  public async resetSocialCredit(
    guild: Guild,
    executorUserId: string,
    sureInput: string
  ): Promise<string> {
    const executor = await guild.members.fetch(executorUserId);

    // 權限檢查：僅 Owner
    const isOwner = PermissionGuard.hasRole(executor, config.roles.owner);

    if (!isOwner) {
      throw new AppError('權限不足：僅有服主可以執行點數重置操作！', 403);
    }

    // 防呆檢查：確認輸入文字轉換為小寫是否為 'yes'
    if (sureInput.trim().toLowerCase() !== 'yes') {
      return '已取消重置操作。若欲執行重置，請在 `sure` 欄位填寫 `yes`！';
    }

    await socialCreditRepository.softDeleteGuildLogs(guild.id);
    return `已成功清空全伺服器所有公務員計點紀錄，全體管理人員點數已重置為初始 ${INITIAL_SOCIAL_CREDIT_SCORE} 分！`;
  }

  /**
   * 計算成員在「排除 adminTag 及裝飾身分組」後的最高身分組位階 (Position)
   */
  private getHighestEffectiveRolePosition(member: GuildMember): number {
    const adminTagRoleId = config.roles.adminTag;
    let maxPosition = -1;

    for (const role of member.roles.cache.values()) {
      if (role.id === member.guild.id) continue; // 排除 @everyone
      if (adminTagRoleId && role.id === adminTagRoleId) continue; // 排除 adminTag
      if (RoleUtils.isDividerRole(role.name)) continue; // 排除 [...] 裝飾身分組

      if (role.position > maxPosition) {
        maxPosition = role.position;
      }
    }

    return maxPosition;
  }

  /**
   * 取得 adminTag 身分組本身以及位於 adminTag 底下至第一個 Divider Role 之間的所有「管理類身分組 ID」
   */
  public getAdminCategoryRoleIds(guild: Guild): string[] {
    const adminTagRoleId = config.roles.adminTag;
    const result: string[] = [];

    if (!adminTagRoleId) return result;

    result.push(adminTagRoleId);

    const sortedRoles = Array.from(guild.roles.cache.values()).sort(
      (a, b) => b.position - a.position
    );

    const adminTagIdx = sortedRoles.findIndex((r) => r.id === adminTagRoleId);
    if (adminTagIdx !== -1) {
      for (let i = adminTagIdx + 1; i < sortedRoles.length; i++) {
        const role = sortedRoles[i];
        if (RoleUtils.isDividerRole(role.name)) {
          break;
        }
        if (role.id !== guild.id) {
          result.push(role.id);
        }
      }
    }

    return result;
  }
}

export const roleService = new RoleService();
