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
        .setDescription('顯示伺服器管理員與公職人員列表')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('demerit')
        .setDescription('管理員加扣分')
        .addUserOption((option) =>
          option.setName('user').setDescription('被加扣分的對象').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('加分或扣分')
            .setRequired(true)
            .addChoices(
              { name: '加分 (+)', value: 'add' },
              { name: '扣分 (-)', value: 'deduct' }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName('points')
            .setDescription('分數 (1 ~ 6 分)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(6)
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('加扣分理由').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('social_credit')
        .setDescription('查看管理員加扣分紀錄')
        .addUserOption((option) =>
          option.setName('user').setDescription('目標管理員').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset_social_credit')
        .setDescription('重置管理員加扣分紀錄 (僅限服主使用)')
        .addStringOption((option) =>
          option.setName('sure').setDescription('請填寫yes').setRequired(true)
        )
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
        await BaseResponse.send(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
        break;
      }
      case 'demerit': {
        await interaction.deferReply({ ephemeral: false });
        const embed = await roleService.getDemeritEmbed(
          interaction.guild,
          interaction.user.id,
          interaction.options.getUser('user', true).id,
          interaction.options.getString('action', true) as 'add' | 'deduct',
          interaction.options.getInteger('points', true),
          interaction.options.getString('reason', true)
        );

        await BaseResponse.send(interaction, embed);
        break;
      }
      case 'social_credit': {
        await interaction.deferReply({ ephemeral: false });
        const embed = await roleService.getSocialCreditEmbed(
          interaction.guild,
          interaction.options.getUser('user', true).id
        );
        await BaseResponse.send(interaction, embed);
        break;
      }
      case 'reset_social_credit': {
        await interaction.deferReply({ ephemeral: true });
        PermissionGuard.requireRole(interaction, config.roles.owner, '您沒有服主權限，無法執行此指令！');
        const message = await roleService.resetSocialCredit(
          interaction.guild,
          interaction.user.id,
          interaction.options.getString('sure', true)
        );
        await BaseResponse.send(interaction, message);
        break;
      }
      default:
        await BaseResponse.send(interaction, `未知的子指令: ${subcommand}`, true);
    }
  },
};
