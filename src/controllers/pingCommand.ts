import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { pingService } from '../services/pingService';

/**
 * /ping 表現層指令控制器 (已經過 UI 與業務解耦優化)
 */
export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('三層架構基礎設施驗證指令')
    .addSubcommand(subcommand =>
      subcommand
        .setName('latency')
        .setDescription('📡 測試機器人 WebSocket 延遲')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('error')
        .setDescription('🔥 製造一個未處理錯誤，驗證 Webhook 警報系統')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('otel')
        .setDescription('📊 觸發 OpenTelemetry 遙測事件與一般日誌記錄')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('db')
        .setDescription('🗄️ 驗證 Supabase Postgres 連線讀寫測試')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('lock')
        .setDescription('🔒 驗證分散式鎖防連點測試 (鎖定 5 秒)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cache')
        .setDescription('⚡ 驗證全域快取 (Miss 耗時 2 秒/Hit 秒回)')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    // 在執行耗時操作前，先 Defer Reply 確保 Discord 不會因 3 秒超時報錯 (除了直接拋錯與快速延遲指令以外)
    if (subcommand !== 'error' && subcommand !== 'latency') {
      await interaction.deferReply({ ephemeral: false });
    }

    try {
      switch (subcommand) {
        case 'latency':
          await this.handleLatency(interaction);
          break;
        case 'error':
          await this.handleError(interaction);
          break;
        case 'otel':
          await this.handleOtel(interaction);
          break;
        case 'db':
          await this.handleDb(interaction);
          break;
        case 'lock':
          await this.handleLock(interaction);
          break;
        case 'cache':
          await this.handleCache(interaction);
          break;
        default:
          if (interaction.deferred) {
            await interaction.editReply({ content: `❌ 未知的子指令: ${subcommand}` });
          } else {
            await interaction.reply({ content: `❌ 未知的子指令: ${subcommand}`, ephemeral: true });
          }
      }
    } catch (error) {
      // 由於錯誤會被頂層 bot.ts 捕獲，這裡直接向上拋出
      throw error;
    }
  },

  /**
   * 處理 WebSocket 延遲測試
   */
  async handleLatency(interaction: ChatInputCommandInteraction) {
    const wsPing = interaction.client.ws.ping;
    const embed = await pingService.getPongEmbed(wsPing);
    await interaction.reply({ embeds: [embed] });
  },

  /**
   * 模擬未處理系統錯誤以測試警報
   */
  async handleError(interaction: ChatInputCommandInteraction) {
    throw new Error('🔥 [測試錯誤] 這是一次由開發人員手動觸發的系統 500 異常！用於驗證全域錯誤捕獲與 Discord Webhook 報警機制是否運作正常。');
  },

  /**
   * 測試 OTel
   */
  async handleOtel(interaction: ChatInputCommandInteraction) {
    const embed = await pingService.getOtelEmbed();
    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * 測試 Supabase DB
   */
  async handleDb(interaction: ChatInputCommandInteraction) {
    const embed = await pingService.getDbEmbed();
    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * 測試 LockService
   */
  async handleLock(interaction: ChatInputCommandInteraction) {
    const embed = await pingService.getLockEmbed();
    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * 測試 CacheService
   */
  async handleCache(interaction: ChatInputCommandInteraction) {
    const embed = await pingService.getCacheEmbed();
    await interaction.editReply({ embeds: [embed] });
  },
};
