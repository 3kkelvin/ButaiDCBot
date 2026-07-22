import redis from '../utils/redis';

export interface IGlobalCache {
  cache_key: string;
  category: string;
  data: any;
  expires_at: string;
}

/**
 * 快取資料存取層 (DAL)
 * 負責以 Redis 為底層的高速快取操作
 */
export class CacheRepository {
  private readonly itemPrefix = 'cache:item:';
  private readonly categoryPrefix = 'cache:cat:';

  private getItemKey(cacheKey: string): string {
    return `${this.itemPrefix}${cacheKey}`;
  }

  private getCategoryKey(category: string): string {
    return `${this.categoryPrefix}${category}`;
  }

  /**
   * 獲取單一未過期的快取
   * @param cacheKey 快取鍵值
   */
  public async get(cacheKey: string): Promise<IGlobalCache | null> {
    const raw = await redis.get(this.getItemKey(cacheKey));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as IGlobalCache;
    } catch (err) {
      console.error(`[CacheRepository] Failed to parse JSON for key ${cacheKey}:`, err);
      return null;
    }
  }

  /**
   * 寫入或更新快取 (Set with TTL)
   * @param cacheKey 快取鍵值
   * @param category 業務類別
   * @param data 快取內容
   * @param ttlSeconds 有效秒數
   */
  public async set(
    cacheKey: string,
    category: string,
    data: any,
    ttlSeconds: number
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const cacheObj: IGlobalCache = {
      cache_key: cacheKey,
      category,
      data,
      expires_at: expiresAt,
    };

    const itemKey = this.getItemKey(cacheKey);
    const catKey = this.getCategoryKey(category);

    const pipeline = redis.pipeline();
    // 1. 寫入快取主體並設定 TTL
    pipeline.set(itemKey, JSON.stringify(cacheObj), 'EX', ttlSeconds);
    // 2. 將此 cacheKey 加入類別索引 Set
    pipeline.sadd(catKey, cacheKey);
    // 類別索引 Set 的 TTL 為 1 天或預設過期
    pipeline.expire(catKey, 86400);

    await pipeline.exec();
  }

  /**
   * 刪除指定快取 (單一或多筆)
   * @param keys 快取鍵值或鍵值陣列
   */
  public async deleteByKeys(keys: string | string[]): Promise<void> {
    const cacheKeys = Array.isArray(keys) ? keys : [keys];
    if (cacheKeys.length === 0) return;

    const redisKeys = cacheKeys.map((k) => this.getItemKey(k));
    await redis.del(...redisKeys);
  }

  /**
   * 根據類別批次刪除快取
   * @param category 業務類別
   */
  public async deleteByCategory(category: string): Promise<void> {
    const catKey = this.getCategoryKey(category);
    // 獲取所有屬於該 category 的 cacheKey
    const cacheKeys = await redis.smembers(catKey);

    const pipeline = redis.pipeline();
    if (cacheKeys.length > 0) {
      const itemKeys = cacheKeys.map((k) => this.getItemKey(k));
      pipeline.del(...itemKeys);
    }
    // 刪除類別 Set
    pipeline.del(catKey);

    await pipeline.exec();
  }
}

export default new CacheRepository();
