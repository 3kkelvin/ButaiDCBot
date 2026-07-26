/**
 * OpenTelemetry 遙測 SDK 初始化模組
 * 
 * 此模組必須在應用程式的第一行載入。
 * 負責配置與載入 NodeSDK、對 http / external API 請求進行自動插樁 (Auto-Instrumentation)，
 * 並將追蹤 (Traces) 與日誌 (Logs) 連線導出至 Axiom 遙測分析平台，同時排除發往 Discord 警報的 Trace 以防遞迴。
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';

const serviceName = 'butaidcbot';

// 排除 Discord 警報的 Trace，防止無限遞迴與雜訊
const ignoreOutgoingRequestHook = (request: { host?: string | null; path?: string | null; hostname?: string | null }) => {
  const hostname = request.hostname || request.host || '';
  const path = request.path || '';
  return hostname.includes('discord') || path.includes('discord');
};

const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET;

if (!axiomToken || !axiomDataset) {
  console.warn('⚠️  Warning: AXIOM_TOKEN or AXIOM_DATASET is missing. Telemetry exporters might fail.');
}

// 1. 配置 Trace Exporter (導出至 Axiom Trace Endpoint)
const traceExporter = new OTLPTraceExporter({
  url: 'https://api.axiom.co/v1/traces',
  headers: {
    Authorization: `Bearer ${axiomToken}`,
    'X-Axiom-Dataset': axiomDataset || '',
  },
});

// 2. 配置 Log Exporter (導出至 Axiom Logs Endpoint)
const logExporter = new OTLPLogExporter({
  url: 'https://api.axiom.co/v1/logs',
  headers: {
    Authorization: `Bearer ${axiomToken}`,
    'X-Axiom-Dataset': axiomDataset || '',
  },
});

const resource = resourceFromAttributes({
  'service.name': serviceName,
  env: process.env.NODE_ENV || 'local',
});

// 3. 使用 NodeSDK 同時初始化 Trace 與 Logs
export const sdk = new NodeSDK({
  resource,
  traceExporter,
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: logExporter })],
  instrumentations: [
    getNodeAutoInstrumentations({
      // 僅在 HttpInstrumentation 中排除 Discord 對外請求，並在進站時將 claritySessionId 寫入 Span 屬性
      '@opentelemetry/instrumentation-http': {
        ignoreOutgoingRequestHook,
        requestHook: (span: any, request: any) => {
          if (request) {
            // span.kind === 1 代表 SpanKind.SERVER (進站 HTTP 請求)
            if (span.kind === 1) {
              request.__otel_server_span__ = span;

              const claritySessionId = request.headers?.['x-clarity-session-id'];
              if (claritySessionId) {
                span.setAttribute('claritySessionId', claritySessionId);
              }
            }
            // span.kind === 2 代表 SpanKind.CLIENT (出站第三方 HttpClient 呼叫)
            else if (span.kind === 2) {
              request.__otel_span__ = span;

              if (typeof request.getHeader === 'function') {
                const otelReqBodyStr = request.getHeader('x-otel-request-body');
                if (otelReqBodyStr) {
                  try {
                    const bodyDecoded = decodeURIComponent(otelReqBodyStr);
                    span.setAttribute('http.request.body', bodyDecoded);
                  } catch (e) {
                    // 防禦性忽略解碼失敗
                  }
                  // 清除自訂 Header，確保不會發送給第三方服務
                  if (typeof request.removeHeader === 'function') {
                    request.removeHeader('x-otel-request-body');
                  }
                }
              }
            }
          }
        }
      },
      // 關閉 DNS 自動插樁，防範其重寫原生 dns 方法從而破壞 dns.setDefaultResultOrder('ipv4first')
      '@opentelemetry/instrumentation-dns': {
        enabled: false,
      },
      // 關閉 FS 自動插樁，減少系統對磁碟讀寫產生的吵雜 logs
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
      // 關閉 Net 自動插樁，免除底層 TCP/Socket 產生的過多 Spans 消耗額度
      '@opentelemetry/instrumentation-net': {
        enabled: false,
      },
    }),
  ],
});

// 啟動 SDK
try {
  sdk.start();
  console.log('⚡ OpenTelemetry SDK initialized successfully (decoupled OTLP/Axiom exporter).');
} catch (error) {
  console.error('❌ Failed to initialize OpenTelemetry SDK:', error);
}

// 優雅關閉
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('⚡ OpenTelemetry SDK terminated.'))
    .catch((error) => console.error('❌ Error terminating OpenTelemetry SDK:', error))
    .finally(() => process.exit(0));
});
