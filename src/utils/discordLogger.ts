import discordHttpClient from './discordHttpClient';

/**
 * Discord 錯誤通知與日誌工具 (Webhook)
 */
export class DiscordLogger {
  private static webhookUrl: string = process.env.DISCORD_WEBHOOK_URL || '';
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
}
