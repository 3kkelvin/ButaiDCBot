import { supabase } from '../utils/db';
import { BaseRepository } from './baseRepository';

export interface IDistributedLock {
  lock_key: string;
  created_at: string;
}

/**
 * Lock Repository (DAL)
 * 專門處理 PostgreSQL 中通用分散式鎖 (distributed_locks) 的資料存取
 */
export class LockRepository extends BaseRepository<IDistributedLock> {
  constructor() {
    super('distributed_locks', 'lock_key');
  }

  /**
   * 嘗試獲取鎖 (原子寫入)
   * @param lockKey 鎖的鍵值 (主鍵)
   * @returns 是否成功獲取鎖
   */
  public async acquireLock(lockKey: string): Promise<boolean> {
    try {
      // 嘗試寫入一筆 Lock 紀錄
      // 由於 lock_key 是 Primary Key，若併發寫入，僅會有一個成功，其它會拋出 Unique Violation 異常
      await this.create({ lock_key: lockKey });
      return true;
    } catch (error: any) {
      // 23505 為 PostgreSQL 的 Unique Violation 錯誤碼 (鍵值重複)
      if (
        error.code === '23505' || 
        error.message?.includes('23505') || 
        error.message?.includes('duplicate key')
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 釋放鎖 (原子刪除)
   * @param lockKey 鎖的鍵值
   */
  public async releaseLock(lockKey: string): Promise<void> {
    await this.delete(lockKey);
  }

  /**
   * 清理已過期的殘留鎖
   * @param minutes 鎖定超時分鐘數 (預設為 5 分鐘)
   */
  public async cleanupExpiredLocks(minutes: number = 5): Promise<void> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .lt('created_at', cutoff);

    if (error) {
      throw error;
    }
  }
}

export default new LockRepository();
