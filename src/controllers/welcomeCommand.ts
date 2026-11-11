import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { ICommand } from '../utils/commands';
import { welcomeService } from '../services/welcomeService';
import { BaseResponse } from '../utils/baseResponse';
import { PermissionGuard } from '../utils/permissionGuard';

/**
 * /welcome 表現層指令控制器
 */
export const welcomeCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('設定新成員加入時的自動歡迎頻道與歡迎詞')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('發送歡迎訊息的目標文字頻道')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('context')
        .setDescription('新成員歡迎詞內容')
        .setRequired(true)
    ),

  annotations: ['歡迎系統'],

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = PermissionGuard.guildGuard(interaction);
    PermissionGuard.requireManager(interaction);

    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const context = interaction.options.getString('context', true);

    await interaction.deferReply({ ephemeral: false });

    const embed = await welcomeService.setupWelcome(
      guild.id,
      channel.id,
      context
    );

    await BaseResponse.send(interaction, embed);
  },
};
