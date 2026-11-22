import {
  Channel,
  ChannelType,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { ICommand } from '../utils/commands';
import { threadService } from '../services/threadService';
import { BaseResponse } from '../utils/baseResponse';
import { PermissionGuard } from '../utils/permissionGuard';

/**
 * /back_to_top 表現層指令控制器 (原 /threads top 升級改名)
 * 職責：解析進度百分比與目標頻道，委派 threadService 計算歷史定位點並回傳跳轉卡片
 */
export const backToTopCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('back_to_top')
    .setDescription('快速定位至頻道、帖子或子區的歷史訊息位置 (回頂/百分比定位)')
    .addStringOption((option) =>
      option
        .setName('progress')
        .setDescription('定位歷史訊息的時間軸進度百分比 (例如 50、50%，範圍 1-100%，預設 100% 回到最頂端)')
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('target_channel')
        .setDescription('指定目標頻道、帖子或子區進行回頂 (不填則預設為當前頻道)')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread
        )
        .setRequired(false)
    ),

  annotations: ['訊息回頂', '導航定位'],

  async execute(interaction: ChatInputCommandInteraction) {
    // 衛哨檢查：確保在 Discord 伺服器內執行
    PermissionGuard.guildGuard(interaction);

    await interaction.deferReply({ ephemeral: true });

    const targetChannel = (interaction.options.getChannel('target_channel') ||
      interaction.channel) as Channel | null;
    const progress = interaction.options.getString('progress');

    const embed = await threadService.getBackToTopEmbed({
      channel: targetChannel,
      progress,
    });
    await BaseResponse.send(interaction, embed);
  },
};
