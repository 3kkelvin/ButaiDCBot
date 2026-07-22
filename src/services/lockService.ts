import lockRepository from '../repositories/lockRepository';
import { AppError } from '../utils/appError';

export interface ILockOptions {
  lockKey: string;
  releaseOnSuccess?: boolean; // 成功時是否主動釋放鎖。預設為 true。若為 false，則成功時保留鎖直至自動過期，僅在拋出異常時釋放。
  ttlMs?: number; // 鎖定自動過期毫秒數，預設 30000ms (30秒)
}

/**
 * 通用分散式鎖服務 (BLL)
 * 負責處理並發控制邏輯，隔離業務層與 DAL 層的鎖操作
 */
export class LockService {
  /**
   * 在分散式鎖的保護下執行特定的業務邏輯
   * @param options 鎖配置選項
   * @param callback 鎖定期間要執行的非同步業務邏輯
   * @returns 返回 callback 的結果；若未取得鎖，則拋出 429 AppError
   */
  public async runWithLock<T>(
    options: ILockOptions,
    callback: () => Promise<T>
  ): Promise<T> {
    const { lockKey, releaseOnSuccess = true, ttlMs = 30000 } = options;

    // 1. 嘗試獲取鎖 (Redis 原子寫入)
    const acquired = await lockRepository.acquireLock(lockKey, ttlMs);
    if (!acquired) {
      // 獲取鎖失敗，直接拋出 429 AppError
      throw new AppError('此操作正在處理中，請稍候重試。', 429);
    }

    try {
      // 2. 獲取鎖成功，執行業務邏輯
      const result = await callback();

      // 3. 根據配置，在執行成功後是否釋放鎖
      if (releaseOnSuccess) {
        await lockRepository.releaseLock(lockKey);
      }

      return result;
    } catch (error) {
      // 4. 過程中若拋出任何異常，一律主動釋放鎖，以防鎖殘留導致無法重試
      try {
        await lockRepository.releaseLock(lockKey);
      } catch (releaseErr) {
        console.error(`[LockService] Failed to release lock for key ${lockKey} on error:`, releaseErr);
      }
      throw error;
    }
  }
}

export default new LockService();
