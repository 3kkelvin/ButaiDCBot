import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pingService } from '../services/pingService';

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
   * 處理 WebSocket 延遲測試 (Subcommand: latency)
   */
  async handleLatency(interaction: ChatInputCommandInteraction) {
    const wsPing = interaction.client.ws.ping;
    const result = await pingService.getPongMessage(wsPing);

    const embed = new EmbedBuilder()
      .setColor('#00ffcc') // 霓虹綠
      .setTitle('🏓 Pong!')
      .setDescription(result.message)
      .addFields(
        { name: '📡 Websocket 延遲', value: `${result.latency}ms`, inline: true },
        { name: '⏰ 時間戳記', value: `\`${result.timestamp}\``, inline: false }
      )
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  /**
   * 模擬未處理系統錯誤以測試警報 (Subcommand: error)
   */
  async handleError(interaction: ChatInputCommandInteraction) {
    throw new Error('🔥 [測試錯誤] 這是一次由開發人員手動觸發的系統 500 異常！用於驗證全域錯誤捕獲與 Discord Webhook 報警機制是否運作正常。');
  },

  /**
   * 測試 OTel 遙測事件與日誌記錄 (Subcommand: otel)
   */
  async handleOtel(interaction: ChatInputCommandInteraction) {
    const result = await pingService.testOtel();

    const embed = new EmbedBuilder()
      .setColor('#9933ff') // 紫色
      .setTitle('📊 OpenTelemetry 遙測測試')
      .setDescription(result)
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * 測試 Supabase 連線與讀寫 (Subcommand: db)
   */
  async handleDb(interaction: ChatInputCommandInteraction) {
    const result = await pingService.testDb();

    const embed = new EmbedBuilder()
      .setColor('#3399ff') // 藍色
      .setTitle('🗄️ Supabase DB 連線測試')
      .setDescription(result)
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * 測試 LockService 分散式鎖防並發 (Subcommand: lock)
   */
  async handleLock(interaction: ChatInputCommandInteraction) {
    const result = await pingService.testLock();

    const embed = new EmbedBuilder()
      .setColor('#ff9933') // 橘色
      .setTitle('🔒 分散式鎖測試')
      .setDescription(result)
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * 測試 CacheService 快取 Hit/Miss (Subcommand: cache)
   */
  async handleCache(interaction: ChatInputCommandInteraction) {
    const result = await pingService.testCache();

    const embed = new EmbedBuilder()
      .setColor(result.fromCache ? '#ffcc00' : '#ff3366') // Hit 為黃色，Miss 為粉紅
      .setTitle(result.fromCache ? '⚡ 快取命中 (Cache Hit)' : '⚡ 快取遺失 (Cache Miss)')
      .setDescription(result.message)
      .addFields(
        { name: 'Generated At', value: `\`${result.data.generatedAt}\``, inline: false },
        { name: 'Random Key', value: `\`${result.data.random}\``, inline: true }
      )
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
