/**
 * 全域快取資料模型 (Global Cache Model)
 */
export interface IGlobalCache {
  /** 快取唯一鍵值 (Cache Key) */
  cache_key: string;

  /** 快取所屬之業務類別標籤 (Category) */
  category: string;

  /** 快取的實際資料內容 (支援 JSON 可序列化數據) */
  data: any;

  /** 快取預計過期之 ISO 8601 時間字串 */
  expires_at: string;
}
