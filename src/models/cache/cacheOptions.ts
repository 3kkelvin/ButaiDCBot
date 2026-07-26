/**
 * 快取配置選項 DTO
 */
export interface ICacheOptions<T> {
  /** 快取唯一鍵值 (Cache Key) */
  key: string;

  /** 快取的業務分類標籤 (Category) */
  category: string;

  /** 有效秒數 TTL (支援固定數字或動態計算函式) */
  ttl: number | ((data: T) => number);
}
