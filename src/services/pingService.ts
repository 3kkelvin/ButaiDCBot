import { EmbedBuilder } from 'discord.js';
import { otelLogger } from '../utils/otelLogger';
import cacheRepository from '../repositories/cacheRepository';
import lockService from './lockService';
import cacheService from './cacheService';

/**
 * 驗證 Ping 相關基礎設施業務服務 (BLL)
 */
export class PingService {
  /**
   * 獲取 Websocket 延遲 Embed UI
   * @param wsPing client websocket 延遲值
   */
  async getPongEmbed(wsPing: number): Promise<EmbedBuilder> {
    const latency = wsPing < 0 ? 0 : wsPing;
    return new EmbedBuilder()
      .setColor('#00ffcc') // 霓虹綠
      .setTitle('🏓 Pong!')
      .setDescription('📡 網路與延遲測試成功！')
      .addFields(
        { name: '📡 Websocket 延遲', value: `${latency}ms`, inline: true },
        { name: '⏰ 時間戳記', value: `\`${new Date().toISOString()}\``, inline: false }
      )
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();
  }

  /**
   * 測試 OpenTelemetry 並組裝結果 Embed
   */
  async getOtelEmbed(): Promise<EmbedBuilder> {
    // 1. 記錄一筆 info 遙測日誌
    otelLogger.info('[Test] 觸發 /ping otel 測試，記錄一般 INFO 日誌。', {
      testField: 'OtelTestValue',
      timestamp: Date.now(),
    });

    // 2. 記錄一筆自定義事件
    otelLogger.logEvent('OtelVerifyEvent', {
      status: 'success',
      description: 'OpenTelemetry function verification',
    });

    return new EmbedBuilder()
      .setColor('#9933ff') // 紫色
      .setTitle('📊 OpenTelemetry 遙測測試')
      .setDescription('✅ 已成功觸發 OTel 遙測事件與一般日誌記錄。請檢查您的 OTel Collector 或 Axiom 控制台！')
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();
  }

  /**
   * 測試 Supabase Postgres 讀寫連線並組裝結果 Embed
   */
  async getDbEmbed(): Promise<EmbedBuilder> {
    const testKey = 'db_ping_test_key';
    let description = '';

    try {
      // 1. 寫入一筆測試資料至 Redis 快取
      await cacheRepository.set(
        testKey, 
        'PING_TEST', 
        { ping: 'pong', verifiedAt: new Date().toISOString() }, 
        30
      );
      
      // 2. 隨即讀取出來，驗證讀寫完整性
      const retrieved = await cacheRepository.get(testKey);
      
      // 3. 刪除該測試資料
      await cacheRepository.deleteByKeys(testKey);
      
      if (retrieved && retrieved.data?.ping === 'pong') {
        description = `✅ Redis 連線與讀寫測試成功！已成功寫入 Redis 快取並讀回驗證。\n\nRedis 回傳值：\`${JSON.stringify(retrieved.data)}\``;
      } else {
        description = '❌ Redis 測試失敗：讀回的資料與寫入的不符。';
      }
    } catch (error: any) {
      console.error('[Redis Test Error]', error);
      description = `❌ Redis 連線與讀寫測試失敗！\n\n錯誤訊息：\`${error.message}\``;
    }

    return new EmbedBuilder()
      .setColor('#3399ff') // 藍色
      .setTitle('🗄️ Redis 快取連線測試')
      .setDescription(description)
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();
  }

  /**
   * 測試 LockService Redis 分散式鎖功能並組裝結果 Embed
   */
  async getLockEmbed(): Promise<EmbedBuilder> {
    const lockKey = 'test_lock_key';
    
    // 呼叫 Redis 分散式鎖服務，加鎖 5 秒
    const description = await lockService.runWithLock({ lockKey, ttlMs: 10000 }, async () => {
      // 模擬執行 5 秒的非同步業務邏輯
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return '✅ Redis 分散式鎖 (SET NX PX) 成功取得並正常執行完畢！(鎖定時長 5 秒)';
    });

    return new EmbedBuilder()
      .setColor('#ff9933') // 橘色
      .setTitle('🔒 Redis 分散式鎖測試')
      .setDescription(description)
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();
  }

  /**
   * 測試 CacheService Redis 快取功能並組裝結果 Embed
   */
  async getCacheEmbed(): Promise<EmbedBuilder> {
    const cacheKey = 'test_cache_service_key';
    const cacheCategory = 'CACHE_VERIFY';
    
    let isCallbackExecuted = false;

    // 透過 cacheService.getOrSet 獲取 (快取 15 秒)
    const data = await cacheService.getOrSet(
      {
        key: cacheKey,
        category: cacheCategory,
        ttl: 15,
      },
      async () => {
        isCallbackExecuted = true;
        // 模擬從 DB 讀取資料或執行耗時運算 (等候 2 秒)
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return {
          generatedAt: new Date().toISOString(),
          random: Math.random().toString(36).substring(7),
        };
      }
    );

    const title = isCallbackExecuted ? '⚡ Redis 快取遺失 (Cache Miss)' : '⚡ Redis 快取命中 (Cache Hit)';
    const message = isCallbackExecuted 
      ? '✅ 快取遺失，已執行 Callback 進行運算並寫入 Redis 快取！(等候 2 秒)' 
      : '🚀 Redis 快取命中！直接自記憶體快取返回！(Sub-millisecond 回應)';

    return new EmbedBuilder()
      .setColor(isCallbackExecuted ? '#ff3366' : '#ffcc00') // Hit 為黃色，Miss 為粉紅
      .setTitle(title)
      .setDescription(message)
      .addFields(
        { name: 'Generated At', value: `\`${data.generatedAt}\``, inline: false },
        { name: 'Random Key', value: `\`${data.random}\``, inline: true }
      )
      .setFooter({ text: 'ButaiDCBot 基礎設施驗證' })
      .setTimestamp();
  }
}

// 導出單例
export const pingService = new PingService();
