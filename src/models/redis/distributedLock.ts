/**
 * 分散式鎖資料模型 (Distributed Lock Model)
 */
export interface IDistributedLock {
  /** 分散式鎖的唯一鍵值 (Lock Key) */
  lock_key: string;

  /** 鎖建立與獲取的時間戳記 (ISO 8601 格式) */
  created_at: string;
}
