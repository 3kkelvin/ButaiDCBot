import { HttpClient } from './httpClient';
import { AxiosRequestConfig } from 'axios';

/**
 * Discord 專用 HttpClient 類別 (Singleton)
 * 繼承自基礎 HttpClient，額外注入針對 Discord API / Webhook 429 頻率限制的自動退避重試攔截器
 */
export class DiscordHttpClient extends HttpClient {
  private static discordInstance: DiscordHttpClient;

  private constructor(config?: AxiosRequestConfig) {
    // 預設將 Discord Webhook 請求的超時時間設為 5 秒，防止卡死
    super({
      timeout: 5000,
      ...config,
    });
    
    this.setupDiscordInterceptors();
  }

  /**
   * 注入針對 Discord 429 的退避重試攔截器
   * 雖然說429應該有分針對單一頻道或全服的限制 不應該共用同一個httpClient 但懶得分了 先這樣吧 併發數起來再說
   */
  private setupDiscordInterceptors() {
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        
        // 若遇到 429 Too Many Requests，自動讀取 Retry-After 退避重試
        if (error.response?.status === 429 && config && !config._retry) {
          config._retry = true;
          const retryAfter = parseFloat(error.response.headers['retry-after'] || '1.5');
          const delay = retryAfter * 1000;

          console.warn(`[DiscordHttpClient 429] 偵測到 Discord API 頻率限制，將在 ${delay}ms 後重新發送請求...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.axiosInstance(config); // 重新發送請求
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * 獲取 DiscordHttpClient 靜態單例
   */
  public static getInstance(): DiscordHttpClient {
    if (!DiscordHttpClient.discordInstance) {
      DiscordHttpClient.discordInstance = new DiscordHttpClient();
    }
    return DiscordHttpClient.discordInstance;
  }
}

export default DiscordHttpClient.getInstance();
