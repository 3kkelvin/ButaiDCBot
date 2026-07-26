import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { otelLogger } from './otelLogger';

/**
 * 全域 HttpClient 類別 (Singleton)
 * 封裝 Axios 以提供統一的請求處理、OTel 遙測記錄
 */
export class HttpClient {
  private static instance: HttpClient;
  protected axiosInstance: AxiosInstance;

  protected constructor(config?: AxiosRequestConfig) {
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    });

    this.setupInterceptors();
  }

  /**
   * 配置 Axios 攔截器，記錄對外第三方 API 請求
   */
  private setupInterceptors() {
    // Request 攔截器
    this.axiosInstance.interceptors.request.use((config) => {
      const url = config.url || '';
      const baseURL = config.baseURL || '';
      
      // 排除 Discord 警報的對外呼叫，以防無限遞迴
      if (url.includes('discord') || baseURL.includes('discord')) {
        return config;
      }

      // 將原始 Request Body 放入自訂 Header 中傳遞，由 otel.ts 還原寫入 Span
      if (config.data) {
        config.headers = config.headers || {};
        config.headers['x-otel-request-body'] = encodeURIComponent(
          typeof config.data === 'object' ? JSON.stringify(config.data) : String(config.data)
        );
      }

      // 暫存開始時間以計算耗時
      (config as any).metadata = { 
        startTime: Date.now()
      };

      otelLogger.info(`[HttpClient Request] ${config.method?.toUpperCase()} ${url}`, {
        httpClient: {
          type: 'request',
          method: config.method?.toUpperCase(),
          url,
          baseURL,
          body: config.data,
          headers: config.headers,
        }
      });

      return config;
    }, (error) => {
      otelLogger.error(`[HttpClient Request Error]`, error);
      return Promise.reject(error);
    });

    // Response 攔截器
    this.axiosInstance.interceptors.response.use((response) => {
      const config = response.config;
      const url = config.url || '';
      const baseURL = config.baseURL || '';
      
      if (url.includes('discord') || baseURL.includes('discord')) {
        return response;
      }

      const startTime = (config as any).metadata?.startTime;
      const durationMs = startTime ? Date.now() - startTime : undefined;

      // 嘗試將 Response Body 屬性綁定到 OTel Span (如果 activeSpan 存在)
      const activeSpan = (response.request as any)?.__otel_span__;
      if (activeSpan && response.data) {
        activeSpan.setAttribute('http.response.body', typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data));
        activeSpan.setAttribute('http.response.status_code', response.status);
      }

      otelLogger.info(`[HttpClient Response] ${config.method?.toUpperCase()} ${url} - ${response.status} (${durationMs}ms)`, {
        httpClient: {
          type: 'response',
          method: config.method?.toUpperCase(),
          url,
          baseURL,
          statusCode: response.status,
          durationMs,
          body: response.data,
          headers: response.headers,
        }
      });

      return response;
    }, (error) => {
      const config = error.config;
      
      // 記錄一般 Response 錯誤日誌
      if (config) {
        const url = config.url || '';
        const baseURL = config.baseURL || '';
        
        if (url.includes('discord') || baseURL.includes('discord')) {
          return Promise.reject(error);
        }

        const startTime = (config as any).metadata?.startTime;
        const durationMs = startTime ? Date.now() - startTime : undefined;

        const activeSpan = (error.request as any)?.__otel_span__;
        if (activeSpan) {
          if (error.response?.data) {
            activeSpan.setAttribute('http.response.body', typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : String(error.response.data));
          }
          if (error.response?.status) {
            activeSpan.setAttribute('http.response.status_code', error.response.status);
          }
        }

        otelLogger.error(`[HttpClient Response Error] ${config.method?.toUpperCase()} ${url} - ${error.response?.status || 'Network Error'} (${durationMs}ms)`, error, {
          httpClient: {
            type: 'response',
            method: config.method?.toUpperCase(),
            url,
            baseURL,
            statusCode: error.response?.status,
            durationMs,
            errorMessage: error.message,
            body: error.response?.data,
          }
        });
      } else {
        otelLogger.error(`[HttpClient Network Error]`, error);
      }
      return Promise.reject(error);
    });
  }

  /**
   * 取得預設的 HttpClient 實例 (Singleton)
   */
  public static getInstance(): HttpClient {
    if (!HttpClient.instance) {
      HttpClient.instance = new HttpClient();
    }
    return HttpClient.instance;
  }

  /**
   * 工廠方法：建立一個具有特定配置的新 HttpClient 實例
   */
  public static create(config: AxiosRequestConfig): HttpClient {
    return new HttpClient(config);
  }

  /**
   * GET 請求
   */
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }

  /**
   * POST 請求
   */
  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  /**
   * PUT 請求
   */
  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  /**
   * DELETE 請求
   */
  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }
}

export default HttpClient.getInstance();
