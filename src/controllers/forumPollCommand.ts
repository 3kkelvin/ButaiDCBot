import {
  ChannelType,
  ChatInputCommandInteraction,
  ForumChannel,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { ICommand } from '../utils/commands';
import { forumPollService } from '../services/forumPollService';
import { BaseResponse } from '../utils/baseResponse';
import { PermissionGuard } from '../utils/permissionGuard';
import { ForumPollAction, ForumPollMode } from '../models/forum/forumPollDTO';

/**
 * /forum_poll 表現層指令控制器
 */
export const forumPollCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('forum_poll')
    .setDescription('論壇發帖自動發起投票與通知設定')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('forum')
        .setDescription('目標論壇頻道')
        .addChannelTypes(ChannelType.GuildForum)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('操作動作 (on: 啟用/覆蓋 ; off: 完全關閉)')
        .setRequired(true)
        .addChoices(
          { name: '啟用/覆蓋 (on)', value: 'on' },
          { name: '關閉 (off)', value: 'off' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('通知模式 (action 為 on 時生效)')
        .setRequired(false)
        .addChoices(
          { name: '私信 (dm)', value: 'dm' },
          { name: '頻道通知 (channel)', value: 'channel' },
          { name: '無 (none)', value: 'none' }
        )
    )
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('接收通知的指定身分組 (模式為私信或頻道通知時使用)')
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('notify_channel')
        .setDescription('發送通知的文字頻道 (模式為頻道通知時使用)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  annotations: ['論壇管理', '自動投票'],

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = PermissionGuard.guildGuard(interaction);
    PermissionGuard.requireManager(interaction);

    const forumChannel = interaction.options.getChannel('forum', true) as ForumChannel;
    const action = interaction.options.getString('action', true) as ForumPollAction;
    const mode = interaction.options.getString('mode') as ForumPollMode | null;
    const role = interaction.options.getRole('role');
    const notifyChannel = interaction.options.getChannel('notify_channel') as TextChannel | null;

    await interaction.deferReply({ ephemeral: false });

    const embed = await forumPollService.setupForumPoll(
      {
        guildId: guild.id,
        forumId: forumChannel.id,
        action,
        mode: mode || undefined,
        roleId: role?.id,
        notifyChannelId: notifyChannel?.id,
      },
      forumChannel
    );

    await BaseResponse.send(interaction, embed);
  },
};
