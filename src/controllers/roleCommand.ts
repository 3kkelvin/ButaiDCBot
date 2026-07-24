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
        .setDescription('執行全服身分組層級核對檢查（自動指派臨時成員與排除身分衝突）')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view_position')
        .setDescription('顯示伺服器公職與管理人員列表')
    ),

  annotations: ['身份組管理'],

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    // 伺服器環境檢查
    if (!interaction.guild) {
      throw new AppError('此指令僅限在 Discord 伺服器內使用！', 400);
    }
    
    switch (subcommand) {
      case 'identity_check': {
        await interaction.deferReply({ ephemeral: true });
        // 權限檢查：僅限技術公務員身分組執行
        PermissionGuard.requireRole(interaction, config.roles.tech, '您沒有技術公務員權限，無法執行此身分組管理指令！');
        const embed = await roleService.getIdentityCheckEmbed(interaction.guild);
        await BaseResponse.send(interaction, embed);
        break;
      }
      case 'view_position': {
        await interaction.deferReply({ ephemeral: false });
        const embed = await roleService.getPositionListEmbed(interaction.guild);
        await BaseResponse.send(interaction, {
          embeds: [embed],
          allowedMentions: { parse: [] },
        });
        break;
      }
      default:
        await BaseResponse.send(interaction, `未知的子指令: ${subcommand}`, true);
    }
  },
};
