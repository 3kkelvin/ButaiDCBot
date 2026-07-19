import discordHttpClient from './discordHttpClient';

/**
 * Discord 錯誤通知與日誌工具 (Webhook)
 */
export class DiscordLogger {
  private static webhookUrl: string = process.env.DISCORD_WEBHOOK_URL || '';
  private static infoWebhookUrl: string = process.env.DISCORD_INFO_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  private static httpClient = discordHttpClient;

  /**
   * 發送錯誤報告到 Discord Webhook
   */
  public static async sendErrorLog(params: {
    message: string;
    errorName: string;
    stack?: string;
    commandName?: string;
    userId?: string;
    guildId?: string;
    timestamp: string;
    environment: string;
    traceId?: string;
  }) {
    if (!this.webhookUrl) {
      console.warn('⚠️  DISCORD_WEBHOOK_URL is not defined. Skipping Discord log.');
      return;
    }

    try {
      const {
        message,
        errorName,
        stack,
        commandName,
        userId,
        guildId,
        timestamp,
        environment,
        traceId,
      } = params;

      const fields: any[] = [
        { name: 'Message', value: `\`\`\`${message || 'No message'}\`\`\``, inline: false },
        { name: 'Environment', value: environment, inline: true },
        { name: 'Timestamp', value: timestamp, inline: true },
      ];

      if (traceId) {
        fields.push({ name: 'Trace ID', value: `\`${traceId}\``, inline: true });
      }

      fields.push(
        { name: 'Command Name', value: commandName ? `\`/${commandName}\`` : 'N/A', inline: true },
        { name: 'User ID', value: userId ? `\`${userId}\`` : 'N/A', inline: true },
        { name: 'Guild ID', value: guildId ? `\`${guildId}\`` : 'N/A', inline: true }
      );

      const embed = {
        title: `🔴 Error Detected: ${errorName}`,
        color: 15158332, // 紅色
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'ButaiDCBot 報警監控' }
      };

      // 錯誤堆疊限制長度，避免超過 Discord 2000 字元限制
      if (stack) {
        const truncatedStack = stack.length > 1000 ? stack.substring(0, 1000) + '...' : stack;
        embed.fields.push({
          name: 'Stack Trace',
          value: `\`\`\`text\n${truncatedStack}\n\`\`\``,
          inline: false,
        });
      }

      await this.httpClient.post(this.webhookUrl, {
        content: `🚨 **Critical System Error** - ${errorName}`,
        embeds: [embed],
      });
    } catch (err: any) {
      console.error('❌ Error sending log to Discord Webhook:', err.message);
    }
  }

  /**
   * 發送普通資訊日誌與指令審計報告到 Discord Webhook
   */
  public static async sendInfoLog(params: {
    message: string;
    title?: string;
    commandName?: string;
    userId?: string;
    guildId?: string;
    timestamp: string;
    environment: string;
    extraFields?: Array<{ name: string; value: string; inline?: boolean }>;
  }) {
    if (!this.infoWebhookUrl) {
      console.warn('⚠️  DISCORD_INFO_WEBHOOK_URL is not defined. Skipping Discord info log.');
      return;
    }

    try {
      const {
        message,
        title,
        commandName,
        userId,
        guildId,
        timestamp,
        environment,
        extraFields,
      } = params;

      const fields: any[] = [
        { name: 'Detail', value: message || 'N/A', inline: false },
        { name: 'Environment', value: environment, inline: true },
        { name: 'Timestamp', value: timestamp, inline: true },
      ];

      if (commandName) {
        fields.push({ name: 'Command', value: `\`/${commandName}\``, inline: true });
      }
      if (userId) {
        fields.push({ name: 'User ID', value: `\`${userId}\``, inline: true });
      }
      if (guildId) {
        fields.push({ name: 'Guild ID', value: `\`${guildId}\``, inline: true });
      }

      if (extraFields && extraFields.length > 0) {
        fields.push(...extraFields);
      }

      const embed = {
        title: title || 'ℹ️ System Info',
        color: 3447003, // 藍色 (#3498db)
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'ButaiDCBot 審計監控' }
      };

      await this.httpClient.post(this.infoWebhookUrl, {
        embeds: [embed],
      });
    } catch (err: any) {
      console.error('❌ Error sending info log to Discord Webhook:', err.message);
    }
  }
}
export default DiscordLogger;
