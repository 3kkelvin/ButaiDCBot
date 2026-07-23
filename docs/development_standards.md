# ButaiDCBot 開發規範 (Development Standards)

本文件定義了 ButaiDCBot 專案的 TypeScript 開發規範、命名風格、三層式架構程式碼邊界、錯誤處理與安全性要求，所有協同開發者與 AI 助手必須嚴格遵守。

---

## 1. TypeScript 與程式碼風格規範

* **嚴格型別檢查**：
  * `tsconfig.json` 中必須開啟 `"strict": true`。
  * 嚴禁使用 `any` 型別。所有變數、函式參數與回傳值均需有明確的型別定義。
  * 若第三方套件缺少型別，應在 `src/types/` 下自行宣告 `.d.ts` 擴充。
* **命名規範**：
  * **Class / Interface / Enum**：採用 `PascalCase`（例如 `UserService`、`IDiscordUser`）。
  * **變數 / 屬性 / 函式**：採用 `camelCase`（例如 `getUserInfo`、`guildId`）。
  * **檔案與目錄**：採用 `camelCase`（例如 `userService.ts`、`userRepository.ts`）。
  * **環境變數**：採用 `UPPER_SNAKE_CASE`（例如 `DISCORD_TOKEN`、`SUPABASE_URL`）。
  * **Discord 指令 / 選項名稱**：必須遵循 Discord 官方規範，全部小寫並以底線分隔（例如 `/user_profile`、`user_id`）。
* **資料結構隔離 (DTO/DAO)**：
  * 傳入外部 API 或資料庫的原始結構為 **DAO (Data Access Object)**。
  * 在表現層與業務層傳遞的資料結構為 **DTO (Data Transfer Object)**。

---

## 2. 環境變數與數字參數安全規範

* **嚴禁寫死任何 ID 與敏感參數**：
  * 程式碼中絕對不得寫死任何數字參數，包括但不限於：**Discord 伺服器 ID (Guild ID)、頻道 ID (Channel ID)、身分組 ID (Role ID)、使用者 ID (User ID)**。
  * 範例：禁止在程式碼中寫 `if (roleId === '123456789012345678')`。
* **環境變數管理**：
  * 所有與環境、權限、頻道對接相關的 ID 與金鑰，必須統一抽離至 `.env` 檔案中。
  * 使用 `dotenv` 在專案啟動時載入，並在程式中透過 `process.env.XXX` 讀取。
  * 必須提供 `.exampleenv` 檔案，羅列專案運行所需的所有變數，但不包含實際敏感資料。
* **CI/CD 環境注入**：
  * 開發環境、測試環境與正式環境的環境變數應各自獨立。
  * 在 CI/CD（如 Jenkins 或 GitHub Actions）進行部署時，應透過安全憑證儲存庫（如 Credentials File）在建置階段動態生成對應環境的 `.env` 檔案並注入容器。

---

## 3. 三層式架構程式碼邊界規範

本專案遵循嚴格的三層式架構，各層職責邊界如下：

### A. 表現層 (Presentation Layer / Bot Interface)
* **包含組件**：Discord 事件監聽器 (Events, e.g. `interactionCreate`)、斜線指令 (Slash Commands)、按鈕與選單互動 (Buttons/Menus)。
* **職責**：
  * 接收 Discord 使用者的互動請求。
  * 進行基礎的輸入參數型別校驗與權限初審。
  * 呼叫 **業務邏輯層 (Service)** 執行對應的商業邏輯。
  * 將 Service 回傳的結果，格式化為 Discord 的 Message、Embed 或 Components 並回覆給使用者。
* **⚠️ 禁用行為**：
  * **禁止直接存取資料庫 (Supabase)**。
  * **禁止直接呼叫外部 HTTP API**。
  * **禁止直接呼叫複雜的 Discord API 進行查詢**（例如查詢伺服器成員清單、過濾身分組等）。

### B. 業務邏輯層 (Business Logic Layer, BLL)
* **包含組件**：各式 Services (e.g. `AttendanceService`, `ConfigService`)。
* **職責**：
  * 承載核心的業務運算與狀態控制邏輯。
  * 協調多個 Repository 進行資料存取。
  * 決定與控制快取 (Cache) 讀取與失效邏輯。
  * 決定與控制分散式鎖 (Lock) 的生命週期，防止並發重複操作。
* **⚠️ 限制原則**：
  * Service 之間禁止產生循環依賴。共用計算邏輯應下沉至 `utils`。
  * 業務 Service 應保持去呈現化，回傳的應是結構化資料 (DTO)，而非 Discord 特有的 UI 元件（如 Embed 樣式），以利邏輯重用與單元測試。

### C. 資料存取層 (Data Access Layer, DAL)
* **包含組件**：Repositories (e.g. `SupabaseRepository`, `DiscordRepository`)。
* **職責**：
  * 唯一被允許與外部系統直接通訊的層級。
  * **資料庫存取 (Database DAL)**：負責執行 SQL、透過 Supabase Client 與 Postgres 進行資料增刪查改。
  * **Discord 交互 (Discord API DAL)**：負責與 Discord API/SDK 的底層交互（例如查詢 Guild 成員、獲取頻道狀態等）。
* **機制**：
  * 當 Presentation Layer 收到事件需要額外的 Discord 資訊時，必須透過 Service 呼叫 Discord Repository (DAL) 來查詢，不應直接在表現層寫複雜的查詢 API。

---

## 4. 錯誤處理與 Fail-Safe 規範

為了確保機器人的高可用性與程式碼簡潔性，錯誤處理應遵循以下設計：

### A. 頂層非同步錯誤捕獲 (asyncHandler 精神)
* 開發者在編寫 Discord Command 或 Event Handler 時，**禁止在每個方法內手動編寫 try-catch 區塊**。
* 專案應提供一個頂層的包裝函式（或裝飾器），在 Presentation Layer 的頂層自動捕獲所有非同步的錯誤：
  ```typescript
  // 概念範例
  export const commandHandlerWrapper = (fn: Function) => {
    return async (interaction: any, ...args: any[]) => {
      try {
        await fn(interaction, ...args);
      } catch (error) {
        // 將錯誤自動傳遞給全域錯誤處理器
        await globalErrorHandler.handle(error, interaction);
      }
    };
  };
  ```

### B. 自定義業務錯誤 (AppError)
* 當業務邏輯中產生可預期的異常（例如：餘額不足、不在開放時間、權限不足）時，應丟出自定義的 `AppError`。
* `AppError` 攜帶特定的錯誤訊息與業務錯誤碼，全域處理器捕捉到 `AppError` 後，會優雅地透過 Discord 訊息通知使用者，**此類錯誤不會觸發 Discord 報警**。

### C. 系統級 500 未預期錯誤報警
* 當全域錯誤處理器捕捉到未預期的程式報錯（如 DB 連線中斷、`Cannot read properties of undefined` 等非 `AppError`）時，系統會：
  1. 收集當前 Request 上下文（指令名稱、觸發用戶 ID、錯誤 Stack 堆疊）。
  2. 自動透過 **Discord Webhook** 發送格式化的 Embed 報警訊息至**開發者專屬報警頻道**，確保團隊能秒級追蹤線上異常。
  3. 回覆使用者一個友好的通用錯誤提示（如：「系統發生未知錯誤，已通知開發團隊處理」）。

### D. 非關鍵旁路服務 Fail-Safe 容錯
* 非核心金流與非關鍵主線的輔助服務（例如：行事曆同步、發送 Email、日誌遙測上傳），其底層出錯絕對不得阻斷使用者的主要操作。
* 在 Service 層呼叫這些服務時，必須在呼叫處以 `try-catch` 包裹並吞掉異常，僅記錄 OTel 日誌與警告，確保主業務流程能 Fail-Safe 成功完成。

---

## 5. Redis 快取與分散式鎖 Key 集中管理規範

* **強制集中宣告**：
  * 全專案所有 Redis 快取 (Cache) 與分散式鎖 (Lock) 的鍵值 (Keys)，**必須統一在 `src/utils/redisKeys.ts` 的 `RedisKeys` 模組中集中宣告**。
  * **嚴禁在業務 Service 或 Controller 程式碼中硬編碼 (Hardcode) 任何鍵值字串**。
* **命名空間區分**：
  * **分散式鎖 (Lock)**：宣告於 `RedisKeys.Lock` 下。由於 `LockRepository` 底層已內建 `lock:` 前綴，工廠函數產出之 Key 名稱**不得手動加上 `lock:`**，防止產生雙重前綴。
  * **快取 (Cache)**：宣告於 `RedisKeys.Cache` 下。
* **型別安全工廠**：
  * 對於帶有動態參數（如 `guildId`、`userId`）的鍵值，必須以強型別工廠函數（如 `roleDividerFix: (guildId: string) => string`）實作，確保調用端擁有完善的自動補全與型別防錯。
