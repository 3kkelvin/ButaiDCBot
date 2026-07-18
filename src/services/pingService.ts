import { otelLogger } from '../utils/otelLogger';
import cacheRepository from '../repositories/cacheRepository';
import lockService from './lockService';
import cacheService from './cacheService';

export interface IPingResponse {
  message: string;
  latency: number;
  timestamp: string;
}

export class PingService {
  /**
   * 獲取 Ping 指令的回覆資料
   * @param wsPing Discord Client Websocket 延遲 (毫秒)
   */
  async getPongMessage(wsPing: number): Promise<IPingResponse> {
    const latency = wsPing < 0 ? 0 : wsPing;
    return {
      message: 'Pong!',
      latency: latency,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 測試 OpenTelemetry 功能
   */
  async testOtel(): Promise<string> {
    // 1. 記錄一筆 info
    otelLogger.info('[Test] 觸發 /ping otel 測試，記錄一般 INFO 日誌。', {
      testField: 'OtelTestValue',
      timestamp: Date.now(),
    });

    // 2. 記錄一筆自定義事件
    otelLogger.logEvent('OtelVerifyEvent', {
      status: 'success',
      description: 'OpenTelemetry function verification',
    });

    return '✅ 已成功觸發 OTel 遙測事件與一般日誌記錄。請檢查您的 OTel Collector 或 Axiom 控制台！';
  }

  /**
   * 測試 Supabase Postgres 讀寫與連線
   */
  async testDb(): Promise<string> {
    const testKey = 'db_ping_test_key';
    
    try {
      // 1. 寫入一筆測試資料至 caches 表
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
        return `✅ Supabase Postgres 連線與讀寫測試成功！已成功寫入快取表並讀回驗證。資料庫回傳值：\`${JSON.stringify(retrieved.data)}\``;
      } else {
        return '❌ Supabase Postgres 測試失敗：讀回的資料與寫入的不符。';
      }
    } catch (error: any) {
      console.error('[DB Test Error]', error);
      return `❌ Supabase Postgres 連線與讀寫測試失敗！錯誤訊息：\`${error.message}\``;
    }
  }

  /**
   * 測試 LockService 分散式鎖功能 (鎖定 5 秒)
   */
  async testLock(): Promise<string> {
    const lockKey = 'test_lock_key';
    
    // 呼叫分散式鎖服務，加鎖 5 秒
    return await lockService.runWithLock({ lockKey }, async () => {
      // 模擬執行 5 秒的非同步業務邏輯
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return '✅ 分散式鎖成功取得並正常執行完畢！(鎖定時長 5 秒)';
    });
  }

  /**
   * 測試 CacheService 快取功能 (TTL 15 秒)
   */
  async testCache(): Promise<{ message: string; fromCache: boolean; data: any }> {
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

    return {
      message: isCallbackExecuted 
        ? '✅ 快取遺失，已執行 Callback 進行運算並寫入快取！(等候 2 秒)' 
        : '🚀 快取命中！直接自快取資料庫返回！(即時回應)',
      fromCache: !isCallbackExecuted,
      data,
    };
  }
}

// 導出單例
export const pingService = new PingService();
