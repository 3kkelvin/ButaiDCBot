import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { helpService } from '../services/helpService';

/**
 * 幫助指令控制器 系統已實現自動反射 Subcommand 等級與自訂指令註解，無需手動修改此指令內容。
 */
export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('顯示機器人所有的可用 Slash 指令與描述'),

  annotations: ['指令列表'],

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const embed = helpService.getHelpEmbed();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('[HelpCommand Error] 執行 /help 時發生異常:', error);
      throw error;
    }
  }
};

