/**
 * Webhook 相關型別與介面定義檔
 */

/**
 * Webhook 發送檔案
 */
export interface IWebhookFile {
  buffer: Buffer;
  filename: string;
  mimetype?: string;
}
/**
 * Webhook 
 */
export interface IWebhookSendOptions {
  content?: string;
  username?: string;
  avatarUrl?: string;
  embeds?: any[];
  files?: IWebhookFile[];
}
