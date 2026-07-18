import cacheRepository from '../repositories/cacheRepository';

/**
 * 快取配置選項
 */
export interface ICacheOptions<T> {
  key: string;
  category: string;
  ttl: number | ((data: T) => number); // 支援固定秒數或動態計算函式
}

/**
 * 全域快取服務 (BLL)
 * 提供宣告式快取與併發控制邏輯，防止快取擊穿
 */
export class CacheService {
  // 用於請求合併 (Promise Collapsing)，防止快取擊穿
  private activeRequests = new Map<string, Promise<any>>();

  /**
   * 獲取快取，若遺失則執行 callback 並回寫 (Get-or-Set)
   * @param options 快取配置
   * @param callback 原始資料獲取函式
   */
  public async getOrSet<T>(
    options: ICacheOptions<T>,
    callback: () => Promise<T>
  ): Promise<T> {
    const { key, category, ttl } = options;

    // 1. 嘗試從資料庫讀取快取
    const cached = await cacheRepository.get(key);
    if (cached) {
      return cached.data as T;
    }

    // 2. 快取遺失，檢查是否有相同 Key 的請求正在執行中 (Promise Collapsing)
    if (this.activeRequests.has(key)) {
      return this.activeRequests.get(key);
    }

    // 3. 執行 Callback 並管理 Promise 生命週期
    const task = callback()
      .then(async (data) => {
        // 成功拿回資料後，計算 TTL 並回寫快取
        const ttlSeconds = typeof ttl === 'function' ? ttl(data) : ttl;

        try {
          await cacheRepository.set(key, category, data, ttlSeconds);
        } catch (err) {
          console.error(`[CacheService] Failed to set cache for ${key}:`, err);
        }
        return data;
      })
      .finally(() => {
        // 無論成功失敗，執行完畢後自 Map 中移除，確保下次能重新載入
        this.activeRequests.delete(key);
      });

    this.activeRequests.set(key, task);
    return task;
  }

  /**
   * 精確刪除快取 (支援單一或多個 Key)
   * @param keys 快取鍵值或陣列
   */
  public async deleteByKeys(keys: string | string[]): Promise<void> {
    await cacheRepository.deleteByKeys(keys);
  }

  /**
   * 根據類別批次刪除快取
   * @param category 業務類別
   */
  public async deleteByCategory(category: string): Promise<void> {
    await cacheRepository.deleteByCategory(category);
  }
}

export default new CacheService();
