---
name: Axiom Logs 診斷與偵錯技能
description: 授權 AI 代理人透過 ai_db_test/queryAxiomLog.ts 腳本查詢 Axiom Logs，以進行 Trace ID 或 Discord Context 全自動偵錯與分析。
---

# Axiom Logs 診斷與偵錯技能 (Axiom Logging Debug Skill)

本技能旨在引導 AI 代理人如何讀取、查詢並利用本專案中的 Axiom Logs 進行 Discord 機器人端到端 (End-to-End) 的 Debug 與故障排除。

> [!NOTE]
> 本專案的日誌系統已全面接入 **OpenTelemetry (OTel) 標準** 與 Logger API 架構。日誌與遙測的關聯全自動由 OTel 插樁處理，底層篩選與關聯的欄位已調整為 OTel 標準的 `trace_id` 欄位。

## 1. 適用場景

當使用者在對話中提及以下資訊時，**必須主動使用此技能**：
- 提供了一個具體的 `Trace ID`（如 `8b693240-bf7f-4b07-8822-263f350c33a9`）並告知某個指令執行出錯。
- 提供了特定 Discord 使用者 ID (`userId`) 或是伺服器 ID (`guildId`)，指稱發生功能異常。
- 提到「幫我看一下這個請求為什麼失敗」或「看日誌查一下剛剛的錯誤」。

---

## 2. 執行查詢指令與標準查閱流程

為了防止終端機輸出長度限制導致日誌上下文被截斷（Truncated），並避免反覆執行重試，AI 代理人必須遵循以下**「標準無截斷查閱流程」**：

### 執行步驟

1. **重導向輸出至檔案**：
   在執行時，固定直接將日誌輸出重導向寫入臨時檔案 `ai_db_test/query_result.txt`。
   *特別注意：在 Windows PowerShell 環境下，必須使用 `| Out-File -FilePath ai_db_test/query_result.txt -Encoding utf8` 來確保檔案為標準 UTF-8 編碼，防止產生編碼錯誤（unsupported mime type charset=utf-16le）。*

2. **透過原生工具查閱**：
   指令執行完成後，使用 `view_file` 工具直接讀取 `ai_db_test/query_result.txt`，獲取最完整且無任何截斷的日誌上下文。

---

### 指令範本

#### A. 透過 Trace ID 查詢：
```powershell
npx ts-node ai_db_test/queryAxiomLog.ts --traceId <TRACE_ID> | Out-File -FilePath ai_db_test/query_result.txt -Encoding utf8
```

#### B. 透過 Discord 用戶 ID 查詢：
```powershell
npx ts-node ai_db_test/queryAxiomLog.ts --userId <USER_ID> | Out-File -FilePath ai_db_test/query_result.txt -Encoding utf8
```

#### C. 透過 Discord 伺服器 (Guild) ID 查詢：
```powershell
npx ts-node ai_db_test/queryAxiomLog.ts --guildId <GUILD_ID> | Out-File -FilePath ai_db_test/query_result.txt -Encoding utf8
```

#### D. 全文或關鍵字檢索：
```powershell
npx ts-node ai_db_test/queryAxiomLog.ts --search "<KEYWORD>" | Out-File -FilePath ai_db_test/query_result.txt -Encoding utf8
```

> [!IMPORTANT]
> - **行動前說明**：在執行任何需要人類批准執行的工具呼叫（如上述 `run_command` 指令）前，必須先在對話框中向人類說明：「此次執行的目的為透過 queryAxiomLog 查詢並匯出至文字檔以完整排查錯誤原因，預計能取得無截斷的完整日誌鏈。」
> - **原生查閱**：執行成功後，應立即呼叫 `view_file` 讀取 `ai_db_test/query_result.txt`。

---

## 3. 日誌解讀與偵錯步驟

當查詢結果返回後，AI 代理人應按照以下步驟進行故障分析：

1. **重建請求時間線 (Reconstruct Request Timeline)**：
   - 觀察日誌中的編號（如 `[1]`, `[2]`, `[3]`...），它們已按時間先後排序。
   - 確認進站 Discord 事件、指令名稱、或 HTTP Request 的路由、Method。

2. **追蹤資料庫與外部服務 (Track DB & Third-party HttpClient Calls)**：
   - 觀察 OTel 自動插樁生成的資料庫日誌（例如 `pg` 數據庫操作日誌）。
   - 尋找對外 `HttpClient` 遙測日誌（如 Discord Webhook、Supabase REST 等服務發送的資料與回應）。

3. **捕捉 Exception Stack**：
   - 若日誌中包含 `[ERROR]` 級別，展開 `Error details` 讀取 `message`、`name` 與 `Stack Trace`。
   - 定位程式碼發生錯誤的檔案路徑與行數。

4. **提出修正方案**：
   - 結合程式碼與日誌，向使用者報告問題根源。
   - 提供詳細的修正計畫與程式碼變更。

---

## 4. OpenTelemetry 與 Axiom 欄位結構參考 (Gotchas)

在 OpenTelemetry (OTel) + OTLP 導出架構下，寫入 Axiom 的遙測資料主要分為兩種類型，其欄位層級有所不同，開發與查詢時須特別注意：

### A. OTel Logs (透過 `otelLogger` 發出)
此類別為一般業務日誌或手動事件記錄：
- **日誌主體**：位於頂層的 `body` 欄位（而非傳統的 `message`）。
- **日誌等級**：位於 `severity_text` 或 `severity` 欄位（如 `"INFO"`, `"ERROR"`）。
- **Discord 專屬屬性**：位於 `attributes.userId`、`attributes.guildId`、`attributes.commandName`。
- **HTTP 序列化詳情**：位於 `attributes.http`，內含自訂序列化的 `method`, `statusCode`, `url`, `body` 等。
- **HttpClient 外部呼叫**：位於 `attributes.httpClient`。
- **錯誤詳情**：位於 `attributes.error`。

### B. OTel Traces/Spans (透過自動插樁 Http/Pg 發出)
此類別為自動產生的連線段：
- **Span 時間段**：沒有 `body`，其代表的意義與名稱存放在頂層的 `name`（如 `"SELECT FROM caches"`)。
- **執行時間**：位於 `duration`（格式為時間字串如 `"14.2ms"`)。
- **連接型態**：位於 `kind`（`"server"` 代表進站請求，`"client"` 代表出站第三方呼叫）。
- **自動插樁欄位**：所有自動捕獲的 HTTP、DB 屬性及 Discord 屬性皆被放置在 `attributes.custom` 底下，例如：
  - `attributes.custom['userId']`
  - `attributes.custom['guildId']`
  - `attributes.custom['commandName']`

---

## 5. APL 查詢實務與優化參數

由於 Axiom 對新寫入欄位的索引建立存在時間差，或是在資料量少時尚未識別該 Schema 欄位，直接使用 `where attributes.trace_id == '...'` 常會觸發 `invalid field: "attributes"` 錯誤。

為了確保查詢的高可用性與健壯度，請遵循以下查詢指南：

### A. 優先使用 全文檢索 (`search`)
對於 `traceId` 或是 `userId` 查詢，使用 APL 的 `search` 關鍵字，它會進行全文倒排索引檢索，不受欄位 Schema 結構限制：
```apl
['butaibot'] | search 'trace_id_value' | order by _time asc
```

### B. 新增優化查詢參數
本診斷工具已新增以下參數，未來代理人可直接調用：
- **`--inbound`**：
  * 用途：查詢所有「外部進站」的請求與回應遙測。
  * 原理：拼接 APL 條件為 `where kind == 'server'`，僅篩選入站 Spans。
- **`--search <關鍵字>`**：
  * 用途：手動查詢包含該關鍵字的特定日誌（如 `"Scheduler"`）。
  * 原理：拼接 APL 條件為 `search '<關鍵字>'`。
