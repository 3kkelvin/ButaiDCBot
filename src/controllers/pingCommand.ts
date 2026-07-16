import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pingService } from '../services/pingService';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('測試機器人連線狀態，回傳延遲時間。'),

  async execute(interaction: ChatInputCommandInteraction) {
    // 呼叫 Service 層處理業務邏輯，並傳入 Websocket 延遲
    const wsPing = interaction.client.ws.ping;
    const result = await pingService.getPongMessage(wsPing);

    // 表現層負責將 DTO 格式化為 Discord UI Embed 元件
    const embed = new EmbedBuilder()
      .setColor('#00ffcc') // 霓虹綠
      .setTitle('🏓 Pong!')
      .setDescription(result.message)
      .addFields(
        { name: '📡 Websocket 延遲', value: `${result.latency}ms`, inline: true },
        { name: '⏰ 時間戳記', value: `\`${result.timestamp}\``, inline: false }
      )
      .setFooter({ text: 'ButaiDCBot 三層架構測試' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
