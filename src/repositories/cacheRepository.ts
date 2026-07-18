import { BaseRepository } from './baseRepository';
import { supabase } from '../utils/db';

export interface IGlobalCache {
  cache_key: string;
  category: string;
  data: any;
  expires_at: string;
}

/**
 * 快取資料存取層 (DAL)
 * 負責 caches 資料表的底層操作
 */
export class CacheRepository extends BaseRepository<IGlobalCache> {
  constructor() {
    super('caches', 'cache_key');
  }

  /**
   * 獲取單一未過期的快取
   * @param cacheKey 快取鍵值
   */
  public async get(cacheKey: string): Promise<IGlobalCache | null> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq(this.primaryKeyName, cacheKey)
      .gt('expires_at', now) // 防止讀取到已過期的快取
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    return data as IGlobalCache;
  }

  /**
   * 寫入或更新快取 (Upsert)
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

    const { error } = await supabase
      .from(this.tableName)
      .upsert({
        cache_key: cacheKey,
        category,
        data,
        expires_at: expiresAt,
      });

    if (error) {
      throw error;
    }
  }

  /**
   * 刪除指定快取 (單一或多筆)
   * @param keys 快取鍵值或鍵值陣列
   */
  public async deleteByKeys(keys: string | string[]): Promise<void> {
    const cacheKeys = Array.isArray(keys) ? keys : [keys];
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .in(this.primaryKeyName, cacheKeys);

    if (error) {
      throw error;
    }
  }

  /**
   * 根據類別批次刪除快取
   * @param category 業務類別
   */
  public async deleteByCategory(category: string): Promise<void> {
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('category', category);

    if (error) {
      throw error;
    }
  }

  /**
   * 清理所有已過期的快取
   */
  public async cleanupExpiredCaches(): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .lt('expires_at', now);

    if (error) {
      throw error;
    }
  }
}

export default new CacheRepository();
