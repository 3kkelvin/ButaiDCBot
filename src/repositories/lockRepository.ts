import redis from '../utils/redis';

export interface IDistributedLock {
  lock_key: string;
  created_at: string;
}

/**
 * Lock Repository (DAL)
 * 專門處理以 Redis 為基礎的通用分散式互斥鎖 (Distributed Lock)
 */
export class LockRepository {
  private readonly prefix = 'lock:';

  private getKey(lockKey: string): string {
    return `${this.prefix}${lockKey}`;
  }

  /**
   * 嘗試獲取鎖 (Redis 原子寫入 SET key value NX PX ttl)
   * @param lockKey 鎖的鍵值
   * @param ttlMs 鎖定自動過期時間 (毫秒)，預設 30000ms (30秒)
   * @param lockValue 鎖定標記值 (預設為 'locked')
   * @returns 是否成功獲取鎖
   */
  public async acquireLock(
    lockKey: string,
    ttlMs: number = 30000,
    lockValue: string = 'locked'
  ): Promise<boolean> {
    const key = this.getKey(lockKey);
    // SET key value PX ttlMs NX: 若 key 不存在則設置並傳回 OK，否則傳回 null
    const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  /**
   * 釋放鎖 (支援 Lua Script 安全釋放或直接刪除)
   * @param lockKey 鎖的鍵值
   * @param lockValue 若提供值，僅當目前鎖的值相符時才執行刪除 (防誤釋放)
   */
  public async releaseLock(lockKey: string, lockValue?: string): Promise<void> {
    const key = this.getKey(lockKey);
    if (lockValue) {
      // 使用 Lua 腳本確保原子比對與解鎖
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(luaScript, 1, key, lockValue);
    } else {
      await redis.del(key);
    }
  }
}

export default new LockRepository();
