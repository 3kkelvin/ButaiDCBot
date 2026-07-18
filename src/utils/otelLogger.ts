/**
 * OpenTelemetry 結構化日誌包裝服務
 * 
 * 對接 OpenTelemetry API-logs，提供 info, warn, error, debug 以及 logEvent 介面。
 * 負責將 HTTP 請求、回應、系統例外與自定義事件，序列化為強型別且符合標準的日誌格式，
 * 發送給 OTel Logs Provider。此組件不進行任何敏感資訊屏蔽，直接導出原始日誌以方便除錯。
 */
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace } from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';

export const contextStore = new AsyncLocalStorage<{ claritySessionId?: string }>();

// 取得 OTel Logger
const getLogger = () => {
  return logs.getLogger('butaidcbot-logger');
};

/**
 * 發送 Log 至 OpenTelemetry Logger Provider
 */
const sendToOtel = (severityNumber: SeverityNumber, severityText: string, message: string, meta: any = {}) => {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();
  const store = contextStore.getStore();
  
  // 建立具有固定強型別欄位的基底 Payload (不屏蔽敏感字，直接記錄原始資料)
  const payload: any = {
    trace_id: spanContext?.traceId || '',
    span_id: spanContext?.spanId || '',
    claritySessionId: store?.claritySessionId || '',
    env: process.env.NODE_ENV || 'local',
  };

  // 對 HTTP 請求與回應進行固定 Schema 序列化
  if (meta.http && typeof meta.http === 'object') {
    const http = meta.http;
    payload.http = {
      type: http.type,
      method: http.method,
      url: http.url,
      statusCode: http.statusCode,
      durationMs: http.durationMs,
      ip: http.ip,
      headers: http.headers ? (typeof http.headers === 'object' ? JSON.stringify(http.headers) : http.headers) : undefined,
      body: http.body ? (typeof http.body === 'object' ? JSON.stringify(http.body) : http.body) : undefined,
    };
  }

  // 對外 HttpClient 請求與回應進行固定 Schema 序列化
  if (meta.httpClient && typeof meta.httpClient === 'object') {
    const hc = meta.httpClient;
    payload.httpClient = {
      type: hc.type,
      method: hc.method,
      url: hc.url,
      baseURL: hc.baseURL,
      statusCode: hc.statusCode,
      durationMs: hc.durationMs,
      errorMessage: hc.errorMessage,
      headers: hc.headers ? (typeof hc.headers === 'object' ? JSON.stringify(hc.headers) : hc.headers) : undefined,
      body: hc.body ? (typeof hc.body === 'object' ? JSON.stringify(hc.body) : hc.body) : undefined,
    };
  }

  // 對 Unhandled Error 進行固定 Schema 封裝
  if (meta.error && typeof meta.error === 'object') {
    payload.error = {
      message: meta.error.message,
      name: meta.error.name,
      stack: meta.error.stack,
    };
  }

  // 對自定義 Event 事件與資料進行固定 Schema 序列化
  if (meta.eventType) {
    payload.eventType = meta.eventType;
  }
  if (meta.eventData) {
    payload.eventData = typeof meta.eventData === 'object' ? JSON.stringify(meta.eventData) : meta.eventData;
  }

  // 將所有其它非預定義的 metadata 統一打包在單一字串欄位中
  const knownKeys = ['http', 'httpClient', 'error', 'eventType', 'eventData'];
  const extraMeta: any = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!knownKeys.includes(key)) {
      extraMeta[key] = value;
    }
  }

  if (Object.keys(extraMeta).length > 0) {
    payload.metadata = JSON.stringify(extraMeta);
  }

  // 透過 OTel API-logs 發送
  try {
    getLogger().emit({
      severityNumber,
      severityText,
      body: message,
      attributes: payload,
    });
  } catch (err: any) {
    console.error('❌ Failed to emit log via OpenTelemetry:', err.message);
  }
};

/**
 * OpenTelemetry Logger 公開 API
 */
export const otelLogger = {
  info: (message: string, meta?: any) => {
    sendToOtel(SeverityNumber.INFO, 'INFO', message, meta);
  },
  warn: (message: string, meta?: any) => {
    sendToOtel(SeverityNumber.WARN, 'WARN', message, meta);
  },
  error: (message: string, error?: any, meta?: any) => {
    let errDetail = error;
    if (error instanceof Error) {
      errDetail = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    }
    sendToOtel(SeverityNumber.ERROR, 'ERROR', message, { error: errDetail, ...meta });
  },
  debug: (message: string, meta?: any) => {
    sendToOtel(SeverityNumber.DEBUG, 'DEBUG', message, meta);
  },
  
  /**
   * 公開的事件記錄方法 (供手動呼叫)
   */
  logEvent: (eventName: string, data: any) => {
    sendToOtel(SeverityNumber.INFO, 'INFO', `[Event] ${eventName}`, {
      eventType: eventName,
      eventData: data,
    });
  },
};
