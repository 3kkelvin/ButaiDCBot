# ButaiDCBot 小步快跑上線計畫 (Online Tasks)

本計畫採用小步快跑 (Agile/Lean) 模式，將系統的開發與部署切分為三階段，每階段均有明確的交付與驗證指標。

---

## 📅 階段任務規劃

### 🛠️ 第一階段：初期目標 (框架搭建與 Dev 部署驗證)
* **核心任務**：
  1. **專案初始化**：
     * 執行 `npm init`，配置 `tsconfig.json` (開啟 `"strict": true`)。
     * 安裝 `discord.js` (或 `discordx`)、`typescript`、`ts-node` 等核心套件。
  2. **搭好三層架構目錄**：
     * 建立 `src/controllers` (Presentation)、`src/services` (BLL)、`src/repositories` (DAL)、`src/utils` 等空目錄與基本架構。
  3. **撰寫最簡指令 (`/ping`)**：
     * 於 Presentation 層寫一個簡單的 Slash Command `/ping`。
     * 當收到互動時，呼叫 Service 回傳純文字 `"Pong!"`。
  4. **實作本地健康檢查**：
     * 在 `src/utils/` 建立輕量健康檢查機制（例如：本地監聽 5000 port 的 Express，當 Bot client ready 時 `/health` 回傳 200，或 ready 時寫入 `/tmp/healthy`）。
  5. **CI/CD 本地部署**：
     * 移植並配置 `Jenkinsfile`。
     * 配置 Jenkins 的 `env-secret-dev` 憑證檔案 (內含測試 Discord 伺服器 Token 的 Dev 環境變數)。
     * 啟動 3k 本地 Jenkins 進行打包，並自動發布至本地開發機容器。
* **驗證指標**：
  * ✅ Jenkinsfile 在本地 Dev 機器上打包與部署成功。
  * ✅ Jenkins 健康檢查階段順利通過（curl 獲得 200 OK 或檔案探針成功）。
  * ✅ 於 Discord 測試伺服器中輸入 `/ping`，機器人能成功且即時回應 `"Pong!"`。

---

### 📦 第二階段：中期目標 (復刻基礎建設)
* **核心任務**：
  1. **復刻 HttpClient & 429 退避**：
     * 移植舊專案 `httpClient.ts`，移除 500ms 強制隊列，但加入 429 速率限制攔截器，遇 429 自動讀取 `Retry-After` 並進行延遲重試。
  2. **復刻全域錯誤處理與報警**：
     * 移植 `appError.ts` 與 `discordLogger.ts`。
     * 在 Presentation 層寫一個頂層非同步錯誤捕獲包裝（如 `commandWrapper`），當發生 500 錯誤時自動發送 Webhook 警報至開發者頻道，預期業務異常則丟出 `AppError`。
  3. **復刻 Supabase 連線與 Base DAL**：
     * 在 `src/utils/db.ts` 引入 Supabase Client，管理 PostgreSQL 連線池。
     * 重寫 `BaseRepository` 以適配 Supabase / pg 語法。
  4. **復刻全域快取 (Promise Collapsing)**：
     * 在 Postgres 建立 `caches` 快取資料表。
     * 實作 `CacheService.getOrSet`，並加入 Promise Map 機制，防止快取失效時併發請求擊穿 DB。
  5. **復刻分散式鎖 (Distributed Lock)**：
     * 在 Postgres 建立 `distributed_locks` 鎖資料表。
     * 實作 `LockService.runWithLock`，利用 Postgres Unique 約束實現互斥鎖與自動釋放。
  6. **復刻排程任務**：
     * 移植 `scheduler.ts` (node-cron)，定時清理過期快取與過期鎖。
* **驗證指標**：
  * ✅ 透過模擬連點按鈕，驗證分散式鎖是否會拋出 429 `AppError` 阻擋重複操作。
  * ✅ 模擬高並發指令查詢，驗證 Promise Collapsing 是否成功合併請求。
  * ✅ 故意手動拋出 500 錯誤，驗證頂層捕獲是否成功透過 Webhook 發送異常 Embed 報警到 Discord 開發頻道。

---

### 🚀 第三階段：長期目標 (正式伺服器部署與身分組檢查)
* **核心任務**：
  1. **開發身分組檢查功能**：
     * **DAL 層**：在 `DiscordRepository` 中寫入與 Discord API / SDK 的互動，用以查詢使用者在該 Guild 中的 Roles 資訊。
     * **BLL 層**：在 `AuthService` 中撰寫檢查邏輯，判斷使用者是否具備指定的 Discord 身分組。
     * **Presentation 層**：撰寫 `/check_role` 指令，呼叫 Service 檢查後，格式化為精美 Embed 回覆。
  2. **環境變數切換**：
     * 準備 Main 環境的 `.env`（指向正式大舞台伺服器的 Token），主動提供給 3k 寫入 Jenkins 憑證 `env-secret-main`。
  3. **正式主機部署對接**：
     * 搭建線上 AWS EC2 虛擬機作為運行 Host，安全組僅開放 SSH。
     * 在 Jenkinsfile 中設定遠端 SSH 部署流程（利用 SSH Agent 連入 EC2，執行 pull、rm 與啟動正式容器）。
* **驗證指標**：
  * ✅ PR 合併至 `main` 分支後，Jenkins 自動觸發 Production Pipeline，遠端部署至 EC2。
  * ✅ 大舞台伺服器中，一般使用者輸入 `/check_role` 顯示未授權，擁有指定身分組的使用者輸入則顯示驗證成功。
  * ✅ 確認執行過程與 DB 連線穩定，無 OTel 致命異常日誌。
