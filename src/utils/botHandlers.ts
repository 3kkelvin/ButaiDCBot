import { Interaction, Message } from 'discord.js';
import { commandsMap } from './commands';
import { messageController } from '../controllers/messageController';
import { DiscordLogger } from './discordLogger';
import { AppError } from './appError';
import { trace } from '@opentelemetry/api';

/**
 * 處理常駐互動事件監聽 (Events.InteractionCreate)
 * @param interaction 互動實例
 */
export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = commandsMap.get(interaction.commandName);
  if (!command) {
    console.error(`[BotHandlers] 找不到對應的指令處理器: ${interaction.commandName}`);
    return;
  }

  // 1. 指令審計普通 Log (支援 skipAuditLog 特性過濾)
  if (!command.skipAuditLog) {
    let fullCommandName = interaction.commandName;
    try {
      const subcommand = interaction.options.getSubcommand(false);
      if (subcommand) {
        fullCommandName = `${interaction.commandName} ${subcommand}`;
      }
    } catch (e) {
      // 忽略無子指令的解析例外
    }

    DiscordLogger.sendInfoLog({
      title: '📝 Slash 指令呼叫審計',
      message: `👤 用戶 **${interaction.user.tag}** 呼叫了指令: \`/${fullCommandName}\``,
      commandName: fullCommandName,
      userId: interaction.user.id,
      guildId: interaction.guildId || 'DM (私訊)',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'local',
    }).catch((logErr) => {
      console.error('[BotHandlers] 發送指令審計日誌失敗：', logErr.message);
    });
  }

  // 2. 頂層全域錯誤捕獲與報警
  try {
    await command.execute(interaction);
  } catch (error: any) {
    console.error(`[Command Error] 執行指令 ${interaction.commandName} 時發生未預期異常:`, error);

    // 判斷是否為自定義的 AppError (業務級 429 錯誤等)
    const isAppError = error instanceof AppError;
    const userMessage = isAppError ? error.message : '系統發生未知錯誤';

    // 系統級錯誤，自動觸發 Discord Webhook 報警
    if (!isAppError) {
      const activeSpan = trace.getActiveSpan();
      const traceId = activeSpan?.spanContext().traceId;

      await DiscordLogger.sendErrorLog({
        message: error.message || 'Unknown system error',
        errorName: error.name || 'SystemError',
        stack: error.stack,
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId || undefined,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'local',
        traceId,
      }).catch((logErr) => {
        console.error('[BotHandlers] 發送 Discord 錯誤報警失敗：', logErr.message, error.stack);
      });
    }

    // 回覆使用者錯誤狀態
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: userMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: userMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('[BotHandlers Error] 回覆錯誤訊息時再度失敗：', replyError);
    }
  }
}

/**
 * 處理常駐文字訊息事件監聽 (Events.MessageCreate)
 * @param message 訊息實例
 */
export async function handleMessage(message: Message): Promise<void> {
  try {
    await messageController.handleMessage(message);
  } catch (error: any) {
    console.error(`[Message Error] 執行文字訊息過濾時發生未預期異常:`, error);

    // 判斷是否為自定義的 AppError
    const isAppError = error instanceof AppError;

    // 系統級未處理錯誤，自動觸發 Discord Webhook 報警，確保防禦性
    if (!isAppError) {
      const activeSpan = trace.getActiveSpan();
      const traceId = activeSpan?.spanContext().traceId;

      await DiscordLogger.sendErrorLog({
        message: error.message || 'Unknown message handler error',
        errorName: error.name || 'MessageHandlerError',
        stack: error.stack,
        userId: message.author?.id,
        guildId: message.guildId || undefined,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'local',
        traceId,
      }).catch((logErr) => {
        console.error('[BotHandlers] 發送 Discord 訊息過濾錯誤報警失敗：', logErr.message, error.stack);
      });
    }
  }
}
