import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { commandsList } from '../utils/commands';

/**
 * 幫助指令控制器 (自動化動態讀取指令列表)
 */
export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 顯示機器人所有的可用 Slash 指令與描述'),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const embed = new EmbedBuilder()
        .setColor('#00ffcc') // 霓虹綠
        .setTitle('🤖 ButaiDCBot 可用指令一覽')
        .setDescription('以下是目前系統中所有已註冊並可供呼叫的 Slash 指令。系統會自動檢索新註冊的功能，无需手動維護。')
        .setTimestamp()
        .setFooter({ text: 'ButaiDCBot 指令引導手冊' });

      // 遍歷 commandsList 自動生成指令列表 fields
      for (const cmd of commandsList) {
        const name = cmd.data.name;
        const description = cmd.data.description || '無描述資訊';
        
        // 可選：如果在 Command 上有定義特殊的 skipAuditLog 欄位，我們可以特別標註
        const auditTag = cmd.skipAuditLog ? '🔒 隱私' : '📝 審計';
        
        embed.addFields({
          name: `\`/${name}\`  (${auditTag})`,
          value: description,
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[HelpCommand Error] 執行 /help 時發生異常:', error);
      throw error;
    }
  }
};
