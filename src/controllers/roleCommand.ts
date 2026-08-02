import { AutocompleteInteraction, ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { roleService } from '../services/roleService';
import { PermissionGuard } from '../utils/permissionGuard';
import { config } from '../config';
import { BaseResponse } from '../utils/baseResponse';
import { ICommand } from '../utils/commands';

export const roleCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('權限、身分組相關指令大類')
    .addSubcommandGroup((group) =>
      group
        .setName('manual')
        .setDescription('手動身分組給予與移除')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('give')
            .setDescription('手動給予指定成員身分組')
            .addUserOption((option) =>
              option.setName('member').setDescription('被給予身分組的目標成員').setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('role')
                .setDescription('選擇要給予的身分組')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('remove')
            .setDescription('手動移除指定成員身分組')
            .addUserOption((option) =>
              option.setName('member').setDescription('被移除身分組的目標成員').setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('role')
                .setDescription('選擇要移除的身分組')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    )
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
        .setDescription('管理加扣分')
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
        .setDescription('重置管理員加扣分紀錄')
        .addStringOption((option) =>
          option.setName('sure').setDescription('請填寫yes').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('total')
        .setDescription('顯示伺服器基本資訊與各階層身分組人數統計')
    ),

  annotations: ['身份組管理'],
  subcommandsMetadata: {
    'manual/give': { annotations: ['手動給予身分組', '(僅特定公職)'] },
    'manual/remove': { annotations: ['手動移除身分組', '(僅特定公職)'] },
    identity_check: { annotations: ['身分組檢查', '(僅技術公務員)'] },
    view_position: { annotations: ['公職列表'] },
    demerit: { annotations: ['管理加扣分', '(僅管理員權限)'] },
    social_credit: { annotations: ['查濫權紀錄'] },
    reset_social_credit: { annotations: ['重置紀錄', '(僅服主)'] },
    total: { annotations: ['基本資訊'] },
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const guild = PermissionGuard.guildGuard(interaction);
    const member = interaction.member as GuildMember;
    if (!member) return;

    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'role') {
      const choices = roleService.getManualRoleChoices(guild, member, focusedOption.value);
      await interaction.respond(choices);
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();
    const guild = PermissionGuard.guildGuard(interaction);

    if (subcommandGroup === 'manual') {
      await interaction.deferReply({ ephemeral: false });
      const executorMember = interaction.member as GuildMember;
      const targetMember = await PermissionGuard.targetGuard(interaction, 'member');
      const targetRoleId = interaction.options.getString('role', true);
      const action = subcommand as 'give' | 'remove';

      const embed = await roleService.manualManageRole(
        guild,
        executorMember,
        targetMember,
        targetRoleId,
        action
      );
      await BaseResponse.send(interaction, embed);
      return;
    }

    switch (subcommand) {
      case 'identity_check': {
        await interaction.deferReply({ ephemeral: true });
        // 權限檢查：僅限技術公務員身分組執行
        PermissionGuard.requireRole(interaction, config.roles.tech, '您沒有技術公務員權限，無法執行此身分組管理指令！');
        const embed = await roleService.getIdentityCheckEmbed(guild);
        await BaseResponse.send(interaction, embed);
        break;
      }
      case 'view_position': {
        await interaction.deferReply({ ephemeral: false });
        const embed = await roleService.getPositionListEmbed(guild);
        await BaseResponse.send(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
        break;
      }
      case 'demerit': {
        await interaction.deferReply({ ephemeral: false });
        const embed = await roleService.getDemeritEmbed(
          guild,
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
          guild,
          interaction.options.getUser('user', true).id
        );
        await BaseResponse.send(interaction, embed);
        break;
      }
      case 'reset_social_credit': {
        await interaction.deferReply({ ephemeral: true });
        PermissionGuard.requireRole(interaction, config.roles.owner, '您沒有服主權限，無法執行此指令！');
        const message = await roleService.resetSocialCredit(
          guild,
          interaction.user.id,
          interaction.options.getString('sure', true)
        );
        await BaseResponse.send(interaction, message);
        break;
      }
      case 'total': {
        await interaction.deferReply({ ephemeral: false });
        const embed = await roleService.getTotalEmbed(guild);
        await BaseResponse.send(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
        break;
      }
      default:
        await BaseResponse.send(interaction, `未知的子指令: ${subcommand}`, true);
    }
  },
};

