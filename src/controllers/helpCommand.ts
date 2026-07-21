import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { commandsList } from '../utils/commands';

/**
 * 幫助指令控制器 (自動化動態讀取指令列表與 Subcommand 映射)
 */
export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 顯示機器人所有的可用 Slash 指令與描述'),

  annotations: ['📖 指令列表'],

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const embed = new EmbedBuilder()
        .setColor('#00ffcc') // 霓虹綠
        .setTitle('🤖 ButaiDCBot 可用指令一覽')
        .setDescription('以下是目前系統中所有已註冊的 Slash 指令。系統已實現自動反射 Subcommand 等級與自訂指令註解，無需手動修改此指令內容。')
        .setTimestamp()
        .setFooter({ text: 'ButaiDCBot 指令引導手冊' });

      // 遍歷 commandsList 自動生成指令與子指令列表 fields
      for (const cmd of commandsList) {
        const name = cmd.data.name;
        const mainAnnotations = cmd.annotations && cmd.annotations.length > 0
          ? `  (${cmd.annotations.map(a => `\`${a}\``).join(' ')})`
          : '';
        const auditTag = cmd.skipAuditLog ? '🔒 隱私' : '📝 審計';

        // 轉換為 JSON 以反射其 options 子結構
        const json = cmd.data.toJSON();
        
        // type === 1 代表 Subcommand 子指令
        const subcommands = json.options?.filter((opt: any) => opt.type === 1) || [];

        if (subcommands.length > 0) {
          // 1. 有子指令：自動映射 Subcommand 等級，並比對其 metadata 註解
          for (const sub of subcommands) {
            const subName = sub.name;
            const subDesc = sub.description;
            const subMeta = cmd.subcommandsMetadata?.[subName];
            const subAnnotations = subMeta?.annotations && subMeta.annotations.length > 0
              ? `  (${subMeta.annotations.map(a => `\`${a}\``).join(' ')})`
              : '';

            embed.addFields({
              name: `\`/${name} ${subName}\`  (${auditTag})${subAnnotations}`,
              value: subDesc,
              inline: false
            });
          }
        } else {
          // 2. 無子指令：直接列出主指令
          const description = json.description || '無描述資訊';
          embed.addFields({
            name: `\`/${name}\`  (${auditTag})${mainAnnotations}`,
            value: description,
            inline: false
          });
        }
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[HelpCommand Error] 執行 /help 時發生異常:', error);
      throw error;
    }
  }
};
