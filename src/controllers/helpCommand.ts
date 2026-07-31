import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { helpService } from '../services/helpService';

/**
 * 幫助指令控制器
 * 系統已實現自動反射 Subcommand 等級與自訂指令註解，並支援 category 選項自動映射與按鈕分頁。
 */
export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('顯示機器人所有的可用 Slash 指令與描述')
    .addStringOption((option) => // 此時僅註冊一個空選項，具體選項在機器人啟動時注入
      option
        .setName('category')
        .setDescription('指定要查詢的指令大類（如 role, timeout）')
        .setRequired(false)
    ),

  annotations: ['指令列表'],

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const category = interaction.options.getString('category');
      const userId = interaction.user.id;

      const result = category
        ? helpService.getCategoryHelp(category, 1, userId)
        : helpService.getTopLevelHelp(1, userId);

      await interaction.reply({
        embeds: [result.embed],
        components: result.components,
        ephemeral: true,
      });
    } catch (error) {
      console.error('[HelpCommand Error] 執行 /help 時發生異常:', error);
      throw error;
    }
  },
};
