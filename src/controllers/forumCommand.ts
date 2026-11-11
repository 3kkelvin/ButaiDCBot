import {
  ChannelType,
  ChatInputCommandInteraction,
  ForumChannel,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { ICommand } from '../utils/commands';
import { forumPollService } from '../services/forumPollService';
import { BaseResponse } from '../utils/baseResponse';
import { PermissionGuard } from '../utils/permissionGuard';

/**
 * /forum poll 表現層指令控制器
 */
export const forumCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('forum')
    .setDescription('論壇相關自動化管理指令')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('poll')
        .setDescription('論壇發帖時自動發起投票，並私信通知指定身分組')
        .addChannelOption((option) =>
          option
            .setName('forum')
            .setDescription('目標論壇頻道')
            .addChannelTypes(ChannelType.GuildForum)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('接收私訊通知的指定身分組')
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName('ping')
            .setDescription('私訊是否附帶免打擾開關按鈕 (true: 提供按鈕可永不打擾 ; false: 僅發通知不帶按鈕)')
            .setRequired(true)
        )
    ),

  annotations: ['論壇管理'],
  subcommandsMetadata: {
    poll: { annotations: ['自動投票', '私訊通知'] },
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = PermissionGuard.guildGuard(interaction);
    PermissionGuard.requireManager(interaction);

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'poll': {
        const forumChannel = interaction.options.getChannel('forum', true) as ForumChannel;
        const role = interaction.options.getRole('role', true);
        const ping = interaction.options.getBoolean('ping', true);

        await interaction.deferReply({ ephemeral: false });

        const embed = await forumPollService.setupForumPoll(
          {
            guildId: guild.id,
            forumId: forumChannel.id,
            roleId: role.id,
            ping,
          },
          forumChannel
        );

        await BaseResponse.send(interaction, embed);
        break;
      }

      default:
        await BaseResponse.send(interaction, `未知的子指令: ${subcommand}`, true);
    }
  },
};
