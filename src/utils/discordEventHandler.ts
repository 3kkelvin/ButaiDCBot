import { trace, context } from '@opentelemetry/api';
import { DiscordLogger } from './discordLogger';
import { AppError } from './appError';

const tracer = trace.getTracer('butai-dc-bot');

/**
 * Discord 事件高階異步包裝函數 (比照舊專案的 asyncHandler)
 * 負責自動捕獲事件執行中的所有未預期異常，進行全域 Webhook 報警，並對用戶端進行 Fail-Safe 錯誤反饋。
 * 
 * @param eventHandlerName 事件處理器名稱 (用於警報分類，例如 'InteractionCreate' 或 'MessageCreate')
 * @param fn 異步事件處理常式
 */
export function discordEventHandler<T extends any[]>(
  eventHandlerName: string,
  fn: (...args: T) => Promise<void> | void
) {
  return async (...args: T): Promise<void> => {
    const isInteraction = eventHandlerName === 'InteractionCreate';

    try {
      if (isInteraction) {
        // 💡 僅針對高價值的指令交互，自動建立 Root Span 並進行 Context 傳播
        const firstArg = args[0];
        const commandName = firstArg?.commandName || 'Unknown';
        const span = tracer.startSpan(`Command: /${commandName}`, {
          attributes: {
            userId: firstArg?.user?.id,
            guildId: firstArg?.guildId || 'DM',
            commandName,
          }
        });

        await context.with(trace.setSpan(context.active(), span), async () => {
          try {
            await fn(...args);
          } finally {
            span.end();
          }
        });
      } else {
        // 💡 對於其他高頻事件 (如 MessageCreate) 預設不建立 Span 以保護性能與費用
        await fn(...args);
      }
    } catch (error: any) {
      console.error(`[EventHandler Error] ${eventHandlerName} 發生未預期異常:`, error);

      const isAppError = error instanceof AppError;

      // 1. 系統級錯誤 (非 AppError)，自動向 Discord Webhook 發送警報 Embed
      if (!isAppError) {
        let traceId: string | undefined;

        // 讀取活躍 Span 的 traceId；若為普通文字事件預設無 Span，則臨時建立短效 Span 獲取 TraceID 用於排障
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          traceId = activeSpan.spanContext().traceId;
        } else {
          const errSpan = tracer.startSpan(`${eventHandlerName}:Error`);
          traceId = errSpan.spanContext().traceId;
          errSpan.end();
        }

        // 嘗試從事件的第一個參數推導上下文資訊
        const firstArg = args[0];
        let userId: string | undefined;
        let guildId: string | undefined;
        let commandName: string | undefined;

        if (firstArg) {
          // 推導 userId
          if (firstArg.user?.id) {
            userId = firstArg.user.id;
          } else if (firstArg.author?.id) {
            userId = firstArg.author.id;
          } else if (typeof firstArg.id === 'string') {
            userId = firstArg.id;
          }

          // 推導 guildId
          if (firstArg.guildId) {
            guildId = firstArg.guildId;
          }

          // 推導 commandName (僅限 Interaction)
          if (firstArg.commandName) {
            commandName = firstArg.commandName;
          }
        }

        // 非同步發送警報日誌，不阻塞事件回調
        DiscordLogger.sendErrorLog({
          message: error.message || 'Unknown event handler error',
          errorName: error.name || `${eventHandlerName}Error`,
          stack: error.stack,
          commandName,
          userId,
          guildId,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'local',
          traceId,
        }).catch((logErr) => {
          console.error(`[discordEventHandler] 發送 Discord 錯誤報警失敗：`, logErr.message);
        });
      }

      // 2. 針對可交互的事件 (如 Interaction)，向用戶端提供錯誤回饋
      const firstArg = args[0];
      if (firstArg && typeof firstArg.reply === 'function') {
        const userMessage = isAppError ? error.message : '系統發生未知錯誤';
        
        try {
          if (firstArg.replied || firstArg.deferred) {
            await firstArg.followUp({ content: userMessage, ephemeral: true });
          } else {
            await firstArg.reply({ content: userMessage, ephemeral: true });
          }
        } catch (replyError) {
          console.error('[discordEventHandler] 嘗試向用戶端回覆錯誤狀態失敗：', replyError);
        }
      }
    }
  };
}
