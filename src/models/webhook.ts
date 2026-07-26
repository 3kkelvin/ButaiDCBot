/**
 * Webhook 相關型別與介面定義檔
 */

/**
 * Webhook 發送檔案附件介面
 */
export interface IWebhookFile {
  /** 檔案內容 Buffer */
  buffer: Buffer;

  /** 檔案名稱 (包含副檔名，如 avatar.png) */
  filename: string;

  /** 檔案 MIME 類型 (選填，如 image/png) */
  mimetype?: string;
}

/**
 * Webhook 發送選項介面
 */
export interface IWebhookSendOptions {
  /** 訊息文字內容 */
  content?: string;

  /** 自訂發送顯示名稱 (Username) */
  username?: string;

  /** 自訂頭像圖片 URL (Avatar URL) */
  avatarUrl?: string;

  /** Embed 卡片列表 */
  embeds?: any[];

  /** 多媒體檔案附件列表 */
  files?: IWebhookFile[];
}
