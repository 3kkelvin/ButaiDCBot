import dotenv from 'dotenv';
import path from 'path';

// 優先加載 .env.dev，其次為 .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.dev') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const args = process.argv.slice(2);
let traceId = '';
let userId = '';
let guildId = '';
let commandName = '';
let searchKeyword = '';
let showInbound = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--traceId' && args[i + 1]) {
    traceId = args[i + 1];
  }
  if (args[i] === '--userId' && args[i + 1]) {
    userId = args[i + 1];
  }
  if (args[i] === '--guildId' && args[i + 1]) {
    guildId = args[i + 1];
  }
  if (args[i] === '--commandName' && args[i + 1]) {
    commandName = args[i + 1];
  }
  if (args[i] === '--search' && args[i + 1]) {
    searchKeyword = args[i + 1];
  }
  if (args[i] === '--inbound') {
    showInbound = true;
  }
}

if (!traceId && !userId && !guildId && !commandName && !searchKeyword && !showInbound) {
  console.log('ℹ   No --traceId, --userId, --guildId, --commandName, --search or --inbound specified. Querying the last 20 log entries by default.\n');
}

const token = process.env.AXIOM_TOKEN;
const dataset = process.env.AXIOM_DATASET;

if (!token || !dataset) {
  console.error('\x1b[31m❌ Error: AXIOM_TOKEN or AXIOM_DATASET is not defined in environment variables.\x1b[0m');
  process.exit(1);
}

// 建立 APL 查詢語法
let apl = `['${dataset}']`;
let isDefaultQuery = false;

if (traceId) {
  apl += ` | where trace_id == '${traceId}' | order by _time asc`;
} else if (userId) {
  apl += ` | search '${userId}' | order by _time asc`;
} else if (guildId) {
  apl += ` | search '${guildId}' | order by _time asc`;
} else if (commandName) {
  apl += ` | search '${commandName}' | order by _time asc`;
} else if (showInbound) {
  apl += ` | where kind == 'server' | order by _time desc | limit 20`;
} else if (searchKeyword) {
  apl += ` | search '${searchKeyword}' | order by _time desc | limit 20`;
} else {
  isDefaultQuery = true;
  apl += ` | order by _time desc | limit 20`;
}

// 輔助函數：解碼 JSON
const parseJsonField = (field: any) => {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (e) {
      return field;
    }
  }
  return field;
};

async function runQuery() {
  try {
    console.log(`🔍 Querying Axiom dataset "${dataset}" with APL:\n   ${apl}\n`);

    const response = await fetch('https://api.axiom.co/v1/datasets/_apl?format=legacy', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apl }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const resData: any = await response.json();
    let events = resData.matches || [];
    if (events.length === 0) {
      console.log('ℹ   No log entries found matching this query in the specified scope.');
      return;
    }
    if (isDefaultQuery) {
      events = events.reverse(); // 反轉以時間升序印出
    }

    console.log(`\x1b[32m✅ Found ${events.length} log entries:\x1b[0m\n`);
    
    events.forEach((event: any, index: number) => {
      const data = event.data;
      const time = event._time || data.timestamp || data.observed_time || '';
      
      // OTel 欄位提取
      const customAttrs = data.attributes?.custom || {};
      const ohttp = data.attributes?.http || {};
      const ohttpClient = data.attributes?.httpClient || {};
      
      // 提取日誌等級
      const level = (data.severity_text || data.severity || data.level || (data.status?.code === 'error' ? 'ERROR' : 'INFO')).toUpperCase();
      
      // 提取日誌訊息 (OTel 規格使用 body)
      let message = data.body || data.message || '';
      if (!message && data.name) {
        const durationStr = data.duration ? ` (${data.duration})` : '';
        const kindStr = data.kind ? ` [${data.kind}]` : '';
        message = `Span: ${data.name}${durationStr}${kindStr}`;
      }
 
      let levelColor = '\x1b[32m'; // INFO
      if (level === 'ERROR') levelColor = '\x1b[31m'; // 紅
      if (level === 'WARN') levelColor = '\x1b[33m'; // 黃
      if (level === 'DEBUG') levelColor = '\x1b[36m'; // 青

      console.log(`\x1b[1m[${index + 1}] ${levelColor}[${level}]\x1b[0m [${time}] ${message}`);

      // 0. 印出遙測 Trace ID & Discord Context (UserId, GuildId, CommandName)
      const traceIdVal = data.trace_id || data.attributes?.trace_id || '';
      const spanIdVal = data.span_id || data.attributes?.span_id || '';
      
      // Discord 專屬屬性提取
      const userIdVal = data.attributes?.userId || customAttrs?.userId || data.attributes?.userId || '';
      const guildIdVal = data.attributes?.guildId || customAttrs?.guildId || data.attributes?.guildId || '';
      const commandNameVal = data.attributes?.commandName || customAttrs?.commandName || data.attributes?.commandName || '';
      
      const telemetry = [];
      if (traceIdVal) telemetry.push(`TraceID: ${traceIdVal}`);
      if (spanIdVal) telemetry.push(`SpanID: ${spanIdVal}`);
      
      const dcCtx = [];
      if (userIdVal) dcCtx.push(`UserID: \x1b[33m${userIdVal}\x1b[0m`);
      if (guildIdVal) dcCtx.push(`GuildID: \x1b[36m${guildIdVal}\x1b[0m`);
      if (commandNameVal) dcCtx.push(`Command: \x1b[32m/${commandNameVal}\x1b[0m`);

      if (telemetry.length > 0) {
        console.log(`   \x1b[90m├─ Telemetry: ${telemetry.join(' | ')}\x1b[0m`);
      }
      if (dcCtx.length > 0) {
        console.log(`   \x1b[90m└─ Discord Context: ${dcCtx.join(' | ')}\x1b[0m`);
      }

      // 1. 格式化 HTTP 請求/回應詳細內容
      let httpMethod = '';
      let httpStatus: any = '';
      let httpDuration = '';
      let httpUrl = '';
      let httpClientIp = '';
      let httpUserAgent = '';
      let httpHeaders: any = null;
      let httpBody: any = null;
      let hasHttp = false;

      if (ohttp && typeof ohttp === 'object' && (ohttp.method || ohttp.url)) {
        httpMethod = ohttp.method;
        httpStatus = ohttp.statusCode;
        httpDuration = ohttp.durationMs ? `${ohttp.durationMs}ms` : '';
        httpUrl = ohttp.url;
        httpClientIp = ohttp.ip;
        httpHeaders = ohttp.headers;
        httpBody = ohttp.body;
        hasHttp = true;
      } else if (customAttrs['http.method'] || customAttrs['http.url'] || data.kind === 'server') {
        httpMethod = customAttrs['http.method'];
        httpStatus = customAttrs['http.status_code'];
        httpDuration = data.duration || '';
        httpUrl = customAttrs['http.url'] || customAttrs['http.target'];
        httpClientIp = customAttrs['http.client_ip'] || customAttrs['net.peer.ip'];
        httpUserAgent = customAttrs['http.user_agent'];
        hasHttp = true;
      }

      if (hasHttp) {
        console.log(`   \x1b[35m└─ HTTP Endpoint Log:\x1b[0m`);
        console.log(`      Method: ${httpMethod || 'N/A'} | Status: ${httpStatus !== undefined && httpStatus !== null ? httpStatus : 'N/A'} | Duration: ${httpDuration || 'N/A'}`);
        console.log(`      URL: ${httpUrl || 'N/A'}`);
        if (httpClientIp) {
          console.log(`      Client IP: ${httpClientIp}`);
        }
        if (httpUserAgent) {
          console.log(`      User Agent: ${httpUserAgent}`);
        }
        if (httpHeaders) {
          const parsed = parseJsonField(httpHeaders);
          console.log(`      Headers: ${JSON.stringify(parsed)}`);
        }
        if (httpBody && httpBody !== '[OMITTED]') {
          const parsed = parseJsonField(httpBody);
          console.log(`      Body: ${JSON.stringify(parsed)}`);
        }
      }

      // 2. 格式化對外 HttpClient 第三方呼叫內容
      let hcMethod = '';
      let hcStatus: any = '';
      let hcDuration = '';
      let hcUrl = '';
      let hcBaseUrl = '';
      let hcErrorMsg = '';
      let hcBody: any = null;
      let hasHc = false;

      if (ohttpClient && typeof ohttpClient === 'object' && (ohttpClient.method || ohttpClient.url)) {
        hcMethod = ohttpClient.method;
        hcStatus = ohttpClient.statusCode;
        hcDuration = ohttpClient.durationMs ? `${ohttpClient.durationMs}ms` : '';
        hcUrl = ohttpClient.url;
        hcBaseUrl = ohttpClient.baseURL;
        hcErrorMsg = ohttpClient.errorMessage;
        hcBody = ohttpClient.body;
        hasHc = true;
      } else if (data.kind === 'client') {
        hcMethod = customAttrs['http.method'];
        hcStatus = customAttrs['http.status_code'];
        hcDuration = data.duration || '';
        hcUrl = customAttrs['http.url'] || customAttrs['http.target'];
        hasHc = true;
      }

      if (hasHc) {
        console.log(`   \x1b[34m└─ Third-Party Call (HttpClient):\x1b[0m`);
        console.log(`      Method: ${hcMethod || 'N/A'} | Status: ${hcStatus !== undefined && hcStatus !== null ? hcStatus : 'N/A'} | Duration: ${hcDuration || 'N/A'}`);
        console.log(`      Request: ${hcBaseUrl || ''}${hcUrl || ''}`);
        if (hcBody && hcBody !== '[OMITTED]') {
          const parsed = parseJsonField(hcBody);
          console.log(`      Req Body: ${JSON.stringify(parsed)}`);
        }
        if (hcErrorMsg) {
          console.log(`      Error Msg: \x1b[31m${hcErrorMsg}\x1b[0m`);
        }
      }

      // 3. 印出詳細報錯資料
      const errObj = data.attributes?.error;
      if (errObj && typeof errObj === 'object' && (errObj.message || errObj.name)) {
        console.log(`   \x1b[31m└─ Error details:\x1b[0m`);
        console.log(`      Message: ${errObj.message}`);
        console.log(`      Name: ${errObj.name}`);
        if (errObj.stack) {
          console.log(`      Stack Trace:\n      ${errObj.stack.split('\n').slice(0, 5).join('\n      ')}...`);
        }
      }

      // 4. 印出 SDK Event 事件資料
      const eventType = data.attributes?.eventType;
      const eventData = data.attributes?.eventData;
      if (eventType) {
        const eventDataParsed = parseJsonField(eventData);
        console.log(`   \x1b[36m└─ SDK Event Data [${eventType}]:\x1b[0m`);
        if (eventDataParsed && (typeof eventDataParsed !== 'object' || Object.keys(eventDataParsed).length > 0)) {
          console.log(`      Data: ${JSON.stringify(eventDataParsed)}`);
        }
      }

      // 5. 印出其餘的自定義 Metadata
      const knownKeys = [
        'level', 'message', 'timestamp', '_time', 'body', 'severity', 'severity_text', 'severity_number', 'observed_time',
        'trace_id', 'span_id', 'trace_flags', 'env', 'http', 'httpClient', 'error', 'eventType', 'eventData', 'metadata',
        'duration', 'kind', 'name', 'parent_span_id', 'events', 'status', 'scope', 'service', 'resource',
        'userId', 'guildId', 'commandName'
      ];
      
      const extraMeta: any = {};
      
      Object.keys(data).forEach(key => {
        if (!knownKeys.includes(key)) {
          extraMeta[key] = data[key];
        }
      });
      
      if (data.attributes && typeof data.attributes === 'object') {
        Object.keys(data.attributes).forEach(key => {
          if (!knownKeys.includes(key) && key !== 'custom') {
            extraMeta[key] = data.attributes[key];
          }
        });
      }
      
      if (customAttrs && typeof customAttrs === 'object') {
        const httpCustomKeys = [
          'http.flavor', 'http.host', 'http.method', 'http.status_text', 'http.url', 'http.target',
          'http.client_ip', 'http.user_agent', 'http.scheme', 'http.status_code',
          'net.peer.ip', 'net.peer.port', 'net.host.ip', 'net.host.port', 'net.host.name', 'net.transport',
          'userId', 'guildId', 'commandName'
        ];
        Object.keys(customAttrs).forEach(key => {
          if (!httpCustomKeys.includes(key) && !knownKeys.includes(key)) {
            extraMeta[key] = customAttrs[key];
          }
        });
      }
      
      const rawMeta = data.attributes?.metadata || data.metadata;
      const parsedMetadata = parseJsonField(rawMeta);
      if (parsedMetadata && typeof parsedMetadata === 'object') {
        Object.assign(extraMeta, parsedMetadata);
      } else if (parsedMetadata) {
        extraMeta.metadata = parsedMetadata;
      }
      
      if (Object.keys(extraMeta).length > 0) {
        console.log(`   \x1b[33m└─ Metadata:\x1b[0m`);
        console.log(`      Data: ${JSON.stringify(extraMeta)}`);
      }

      console.log('\x1b[90m--------------------------------------------------------------------------------\x1b[0m');
    });
  } catch (error: any) {
    console.error(`\x1b[31m❌ Query failed: ${error.message}\x1b[0m`);
  }
}

runQuery();
