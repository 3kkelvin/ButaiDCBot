import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { roleService } from '../services/roleService';
import { PermissionGuard } from '../utils/permissionGuard';
import { config } from '../config';
import { BaseResponse } from '../utils/baseResponse';
import { ICommand } from '../utils/commands';
import { AppError } from '../utils/appError';

export const roleCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('權限、身分組相關指令大類')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('identity_check')
        .setDescription('🔍 執行全服身分組層級核對檢查（自動指派臨時成員與排除身分衝突）')
    ),

  annotations: ['身份組管理'],

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    // 1. 伺服器環境檢查
    if (!interaction.guild) {
      throw new AppError('此指令僅限在 Discord 伺服器內使用！', 400);
    }

    // 2. 權限檢查：僅限技術公務員身分組執行
    PermissionGuard.requireRole(interaction, config.roles.tech,'您沒有技術公務員權限，無法執行身分組核對檢查指令！');

    // 3. 耗時操作進行 Defer Reply
    await interaction.deferReply({ ephemeral: false });

    switch (subcommand) {
      case 'identity_check': {
        const embed = await roleService.getIdentityCheckEmbed(interaction.guild);
        await BaseResponse.send(interaction, embed);
        break;
      }
      default:
        await BaseResponse.send(interaction, `未知的子指令: ${subcommand}`, true);
    }
  },
};
