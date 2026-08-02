import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  Guild,
  Interaction,
  APIInteractionGuildMember,
} from 'discord.js';
import { AppError } from './appError';

/**
 * 高階權限守衛工具
 * 適用於 Controller (表現層) 與 Service (BLL 業務層)
 */
export class PermissionGuard {
  /**
   * 檢查使用者是否擁有指定的任一身分組 (純布林判斷)
   *
   * @param target Discord 互動事件 (ChatInputCommandInteraction / AutocompleteInteraction) 或 成員物件 (GuildMember)
   * @param requiredRoles 允許的身分組 ID 或身分組 ID 陣列
   * @returns true: 擁有至少一個對應身分組 ; false: 無任何匹配身分組
   */
  static hasRole(
    target: Interaction | GuildMember | APIInteractionGuildMember | null | undefined,
    requiredRoles: string | string[]
  ): boolean {
    let member: GuildMember | null = null;

    if (target && typeof target === 'object') {
      if ('roles' in target && target.roles) {
        member = target as GuildMember;
      } else if ('member' in target && target.member) {
        member = target.member as GuildMember;
      }
    }

    if (!member || !member.roles || !member.roles.cache) {
      return false;
    }

    const roleIds = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    const validRoleIds = roleIds.filter((id) => Boolean(id));

    if (validRoleIds.length === 0) {
      return false;
    }

    return validRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  /**
   * 1 行權限斷言守衛 (無權限直接拋出 401 AppError 中斷流程)
   * 由全域 discordEventHandler 自動捕獲並發送私密警告訊息 (ephemeral: true)
   *
   * @param target Discord 互動事件 (ChatInputCommandInteraction) 或 成員物件 (GuildMember)
   * @param requiredRoles 允許的身分組 ID 或身分組 ID 陣列
   * @param customErrorMessage 權限不足時的警示訊息 (可選)
   */
  static requireRole(
    target: ChatInputCommandInteraction | GuildMember | Interaction,
    requiredRoles: string | string[],
    customErrorMessage: string = '❌ 您沒有權限執行此操作！'
  ): void {
    const isAllowed = this.hasRole(target, requiredRoles);
    if (!isAllowed) {
      throw new AppError(customErrorMessage, 401);
    }
  }

  /**
   * 從 Interaction 中安全解析並校驗 Guild 物件
   * 若不在 Discord 伺服器內 (例如私訊 DM)，自動拋出 400 AppError 中斷流程
   *
   * @param interaction Discord 互動事件
   * @param customErrorMessage 自訂錯誤提示 (可選)
   * @returns Guild 物件
   */
  static guildGuard(
    interaction: ChatInputCommandInteraction | Interaction,
    customErrorMessage: string = '❌ 此指令僅限在 Discord 伺服器內使用！'
  ): Guild {
    if (!interaction.guild) {
      throw new AppError(customErrorMessage, 400);
    }
    return interaction.guild as Guild;
  }

  /**
   * 從 Interaction 中安全解析並校驗目標成員 (Target GuildMember)
   * 若找不到該成員或不在伺服器內，自動拋出 400 AppError 中斷流程
   *
   * @param interaction Discord 互動事件
   * @param optionName 選項名稱 (預設 'user')
   * @param customErrorMessage 自訂錯誤提示 (可選)
   */
  static async targetGuard(
    interaction: ChatInputCommandInteraction,
    optionName: string = 'user',
    customErrorMessage: string = '❌ 找不到該成員或該成員不在伺服器中！'
  ): Promise<GuildMember> {
    const guild = this.guildGuard(interaction, customErrorMessage);
    const user = interaction.options.getUser(optionName, true);
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      throw new AppError(customErrorMessage, 400);
    }
    return member as GuildMember;
  }
}
