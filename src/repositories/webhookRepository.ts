import discordHttpClient from '../utils/discordHttpClient';
import FormData from 'form-data';
import { IWebhookSendOptions } from '../models/webhook';

/**
 * Webhook 資料存取層 (DAL)
 * 負責底層與 Discord Webhook 接口的多媒體通訊 (無狀態單例)
 */
export class WebhookRepository {
  /**
   * 發送 Webhook 訊息 (支援普通文字、Embeds 與多媒體檔案發送)
   * @param webhookUrl 目標 Discord Webhook 完整 URL
   * @param options 發送選項
   */
  public async send(webhookUrl: string, options: IWebhookSendOptions): Promise<void> {
    if (!webhookUrl) {
      console.warn('[WebhookRepository] 警告: 傳入的 Webhook URL 為空，取消發送。');
      return;
    }

    const { content, username, avatarUrl, embeds, files } = options;

    // 1. 若無檔案附件，直接發送輕量的 JSON 格式
    if (!files || files.length === 0) {
      await discordHttpClient.post(webhookUrl, {
        content,
        username,
        avatar_url: avatarUrl,
        embeds,
      });
      return;
    }

    // 2. 若包含檔案附件 (圖片、音檔等)，改用 multipart/form-data 格式傳輸
    const form = new FormData();

    // 依據 Discord Webhook 規範，主要 JSON Payload 必須放入 'payload_json' 欄位中
    form.append(
      'payload_json',
      JSON.stringify({
        content,
        username,
        avatar_url: avatarUrl,
        embeds,
      })
    );

    // 依序將二進制檔案追加至 FormData 中
    files.forEach((file, index) => {
      form.append(`files[${index}]`, file.buffer, {
        filename: file.filename,
        contentType: file.mimetype,
      });
    });

    // 送出 Post 請求，並攜帶 FormData 的 boundary Headers
    await discordHttpClient.post(webhookUrl, form, {
      headers: form.getHeaders(),
    });
  }
}

// 導出無狀態單例
export default new WebhookRepository();
