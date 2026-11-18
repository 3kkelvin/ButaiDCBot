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
import { WelcomeAction } from '../models/welcome/welcomeDTO';

/**
 * /welcome 表現層指令控制器
 */
export const welcomeCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('設定新成員加入時的自動歡迎頻道與歡迎詞')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('發送歡迎訊息的目標文字頻道 (action 為 on 時生效)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('context')
        .setDescription('新成員歡迎詞內容 (action 為 on 時生效)')
        .setRequired(false)
    ),

  annotations: ['歡迎系統'],

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = PermissionGuard.guildGuard(interaction);
    PermissionGuard.requireManager(interaction);

    const action = interaction.options.getString('action', true) as WelcomeAction;
    const channel = interaction.options.getChannel('channel') as TextChannel | null;
    const context = interaction.options.getString('context');

    await interaction.deferReply({ ephemeral: false });

    const embed = await welcomeService.setupWelcome({
      guildId: guild.id,
      action,
      channelId: channel?.id,
      context: context || undefined,
    });

    await BaseResponse.send(interaction, embed);
  },
};
