import { EmbedBuilder, Guild, GuildMember } from 'discord.js';
import lockService from './lockService';

/**
 * 分隔身分組判定規則（名稱同時包含以下所有字元）
 */
const DIVIDER_CONTAINS = ['[', ']'];

export interface IRoleDividerResult {
  addedRoles: string[];
  removedRoles: string[];
}

export interface IFixAllMembersResult {
  totalMembers: number;
  processedMembers: number;
  updatedMembers: number;
}

/**
 * 身份組分隔線管理服務 (BLL)
 */
export class RoleDividerService {
  /**
   * 判斷指定的身分組是否為分隔用身分組
   */
  public isDividerRole(roleName: string): boolean {
    return DIVIDER_CONTAINS.every((char) => roleName.includes(char));
  }

  /**
   * 檢查並修復單一成員的身分組分隔線狀態
   * 採用記憶體計算 + member.roles.set() 單次 API 批次覆寫
   * 
   * @param member Discord 伺服器成員
   * @returns 異動的身分組名稱紀錄
   */
  public async fixMemberRoles(member: GuildMember): Promise<IRoleDividerResult> {
    const result: IRoleDividerResult = {
      addedRoles: [],
      removedRoles: [],
    };

    if (!member.guild) {
      return result;
    }

    // 取得該伺服器所有身分組，並依據 position 升冪排序 (最底層在最前面)
    const sortedRoles = Array.from(member.guild.roles.cache.values()).sort(
      (a, b) => a.position - b.position
    );

    const currentRoleIds = new Set(member.roles.cache.keys());
    const targetRoleIds = new Set<string>();

    // 預先留存原先非分隔用身分組 (含 @everyone)
    for (const [roleId, role] of member.roles.cache.entries()) {
      if (!this.isDividerRole(role.name)) {
        targetRoleIds.add(roleId);
      }
    }

    let shouldAddDivider = false;

    // 由下往上計算成員應有的最終身分組
    for (const role of sortedRoles) {
      if (this.isDividerRole(role.name)) {
        // 若該分隔身分組高於機器人自身最高身分組 (!role.editable)，機器人無權操控，保持原狀跳過
        if (!role.editable) {
          shouldAddDivider = false;
          continue;
        }

        const hasRoleCurrently = currentRoleIds.has(role.id);

        if (shouldAddDivider) {
          targetRoleIds.add(role.id);
          if (!hasRoleCurrently) {
            result.addedRoles.push(role.name);
          }
        } else {
          targetRoleIds.delete(role.id);
          if (hasRoleCurrently) {
            result.removedRoles.push(role.name);
          }
        }

        shouldAddDivider = false;
      } else {
        // 非分隔身分組且非預設身分組 (@everyone)，且成員目前擁有該身分組
        if (currentRoleIds.has(role.id) && role.id !== member.guild.id) {
          shouldAddDivider = true;
        }
      }
    }

    // 若有身分組增減異動，只發送單一 HTTP PATCH 請求一次性覆寫
    if (result.addedRoles.length > 0 || result.removedRoles.length > 0) {
      console.log(
        `[RoleDividerService] 為成員 ${member.user.tag} 批次更新身分組: 新增 ${result.addedRoles.length} 個, 移除 ${result.removedRoles.length} 個`
      );
      await member.roles.set(Array.from(targetRoleIds));
    }

    return result;
  }

  /**
   * 批次檢查並修復全伺服器成員的身分組分隔線
   * 使用 Redis 分散式鎖保護，防止管理員連點連發
   * 
   * @param guild Discord 伺服器
   */
  public async fixAllMembers(guild: Guild): Promise<IFixAllMembersResult> {
    const lockKey = `lock:role_divider_fix:${guild.id}`;

    return await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 60000, // 鎖定 60 秒
        releaseOnSuccess: true,
      },
      async () => {
        // 確保取得最新全服成員列表
        const membersCollection = await guild.members.fetch();
        const members = Array.from(membersCollection.values());

        let updatedCount = 0;

        for (const member of members) {
          const res = await this.fixMemberRoles(member);
          if (res.addedRoles.length > 0 || res.removedRoles.length > 0) {
            updatedCount++;
          }
        }

        return {
          totalMembers: members.length,
          processedMembers: members.filter((m) => !m.user.bot).length,
          updatedMembers: updatedCount,
        };
      }
    );
  }

  /**
   * 執行修復業務並組裝結果 Embed (給表現層 Controller 調用)
   * 
   * @param guild 伺服器實例
   * @param targetMember 指定的目標成員（可選）
   */
  public async getFixResultEmbed(
    guild: Guild,
    targetMember?: GuildMember | null
  ): Promise<EmbedBuilder> {
    if (targetMember) {
      // 單一成員修復
      const result = await this.fixMemberRoles(targetMember);

      return new EmbedBuilder()
        .setTitle('身分組分隔線手動修復結果')
        .setColor(0x57f287)
        .setDescription(`已完成對成員 **${targetMember.user.tag}** 的身分組分隔線掃描。`)
        .addFields(
          {
            name: '+ 新增的分隔身分組',
            value: result.addedRoles.length > 0 ? result.addedRoles.join(', ') : '無',
            inline: true,
          },
          {
            name: '- 移除的分隔身分組',
            value: result.removedRoles.length > 0 ? result.removedRoles.join(', ') : '無',
            inline: true,
          }
        )
        .setTimestamp();
    } else {
      // 全服成員批次修復
      const fixResult = await this.fixAllMembers(guild);

      return new EmbedBuilder()
        .setTitle('全伺服器身分組分隔線修復報告')
        .setColor(0x5865f2)
        .setDescription('已完成全伺服器成員身分組分隔線掃描與修正！')
        .addFields(
          { name: '總成員數 (含機器人)', value: `${fixResult.totalMembers} 人`, inline: true },
          { name: '已處理真人成員', value: `${fixResult.processedMembers} 人`, inline: true },
          { name: '有異動成員數', value: `${fixResult.updatedMembers} 人`, inline: true }
        )
        .setTimestamp();
    }
  }
}

export const roleDividerService = new RoleDividerService();
