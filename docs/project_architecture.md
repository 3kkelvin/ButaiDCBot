# ButaiDCBot 系統架構文件 (Project Architecture)

本文件詳細闡述 ButaiDCBot 的系統架構設計哲學、三層式架構映射、邊緣化資料庫、高防禦性全域異常控制、自治控制器事件流，以及關鍵的技術機制（快取合併與分散式鎖）。

---

## 1. 三層式架構與 Discord Bot 映射

本系統嚴格遵循三層式軟體工程架構，各層職責清晰對稱，邊界明確：

1. **表現層 (Presentation Layer - Controllers & Commands)**
   * **成員**：`interactionController`、`messageController`、`pingCommand`、`helpCommand`。
   * **職責**：事件接收自治、請求路由分發、解析 Discord 交互上下文、組裝與渲染多媒體 UI (Embeds, Buttons, Components)。
2. **業務邏輯層 (Business Logic Layer - Services)**
   * **成員**：`pingService`、`cacheService`、`lockService`。
   * **職責**：商業邏輯運算、快取生命週期 (TTL/Promise Collapsing)、分散式鎖原子互斥控制。
3. **資料存取層 (Data Access Layer - Repositories)**
   * **成員**：`webhookRepository`、`cacheRepository` (DAL Helper)。
   * **職責**：底層持久化讀寫 (Supabase/PostgreSQL) 與外部 Discord Rest API 請求封裝。

---

## 2. 邊緣化資料庫與自動初始化

* **低頻與輕量儲存**：本專案不儲存任何 Discord 伺服器成員身分或使用者敏感資料。DB 在本專案中屬於「輔助角色」，僅儲存少數業務記錄、伺服器配置、全域快取 (`caches`) 與防並發的分散式鎖 (`distributed_locks`)。
* **零手動自動建表 (dbInit)**：
  機器人啟動時會自動讀取並順序執行 `database/schemas/` 目錄下的獨立 DDL SQL 檔案。完成偵測與表結構建立後自動關閉 TCP 連線，實現完全自動化。
* **無狀態連線池 (Connection Pooling)**：
  對 PostgreSQL 採用無狀態連線池調度，並開啟 SSL 連線，在 Docker 容器內強制解析 IPv4 DNS 優先以防止 IPv6 路由中斷。

---

## 3. 高速全域快取 (Redis Cache & Promise Collapsing)

快取系統實作於 `CacheService` 與 `CacheRepository` 中，旨在減少外部 API 請求與 Supabase DB 存取次數並提升反應速度：

* **Redis 記憶體快取 (Key-Value & TTL)**：採用 Redis `ioredis` 連線，將資料序列化 JSON 儲存，並利用 Redis 原生 `EXPIRE` / `SET EX` 實現 Sub-millisecond 讀取與自動過期清理。同時維護類別 (Category) 索引 Set 實現極速批次刪除。
* **請求合併 (Promise Collapsing)**：
  在快取失效（Cache Miss）的瞬間，若有多個並發請求同時索取相同 key，`CacheService` 將會在記憶體中將該非同步任務 Promise 進行合併，**所有並發請求共享同一個進行中的 Promise**，僅由第一個請求穿透到外部 API / 資料庫，徹底防止快取擊穿與 API 頻率限制 (Rate Limit)。

---

## 4. Redis 原子分散式鎖與防連點 (Distributed Lock)

為了防範 Discord 使用者對互動元件（按鈕、選單）進行惡意「連點」、快速狂按或並發請求導致的 Race Condition，系統採用基於 Redis 的原子分散式鎖：

* **Redis 原子鎖 (`SET key value NX PX ttl`)**：利用 Redis 原生的原子 `SET ... NX PX` 指令。多個請求併發時，僅會有一個請求成功寫入並取得鎖，其餘請求直接失敗退避。
* **Lua 腳本安全解鎖**：解鎖時比對 key 內的唯一標記值 (`lockValue`)，僅解鎖屬於該請求的鎖，防止因超時誤解鎖其他請求的新鎖。
* **防點擊生命週期 (runWithLock)**：
  業務層核心以閉包實作，進入自動寫入鎖、執行完畢在 `finally` 區塊自動刪除鎖。未獲取鎖的並發請求會直接拋出 `429 AppError` 進行安全退避。
* **原生 TTL 自動死鎖防護**：由 Redis 記憶體引擎原生的 TTL 自動釋放過期鎖，無需定時執行掃描任務。

---

## 5. 全域非同步 Handler 裝飾器 (`discordEventHandler`)

為了解決 Node.js 非同步事件監聽中錯誤難以被頂層捕獲的問題，並消除控制器中重複贅餘的 `try-catch` 代碼，系統引進了 `discordEventHandler` 高階裝飾器：

* **自動上下文裝配**：當事件出錯時，裝飾器會自動偵測首個參數的物件型別，從中解析出觸發者 `userId`、`guildId` 以及呼叫的 `commandName`。
* **統一系統警報**：自動抓取 Active Span 的 OpenTelemetry Trace ID，非同步向 Discord Webhook 警報通道發送錯誤 Embed 日誌（非 `AppError` 錯誤）。
* **UI 失敗自動反饋**：若出錯的事件支持回覆，會全自動呼叫 `.reply` 或 `.followUp` 向用戶回饋 `AppError.message` 或預設的「系統發生未知錯誤」安全提示，大幅改善 UX。
* **條件式 OTel 追蹤與 Trace ID 綁定/注入規則**：
  * **指令生命週期**：僅 `InteractionCreate` (指令事件) 執行時會全自動建立 Root Span 並進行 Context 傳播。指令流程中觸發的所有資料庫 (pg) 查詢與手動日誌將共享並自動綁定完全相同的一個 `trace_id`。
  * **高頻普通事件 (如 MessageCreate)**：為了進行性能保護並避免在 Axiom 產生海量無用日誌與費用，普通發言事件預設不建立 OTel Span。若未來有其他特定事件分支需要進行鏈結追蹤，必須在控制器或業務層內部**手動建立 Span/手動進行上下文注入**，或者在未處理異常拋出時，由裝飾器臨時生成短效 Span 以取得隨機 Trace ID 進行警報鏈綁定。

---

## 6. 排程任務系統 (Scheduled Tasks)

排程任務用於定時清理快取、清理過期鎖、定時招呼或巡檢。

* **低耦合調度**：排程調度中心 `src/utils/scheduler.ts` 僅負責 Cron 表達式管理與定時驅動，不包含任何業務邏輯，必須直接委派給業務層 `Service` 執行。

---

## 7. 未來事件監聽擴充指南 (Event Extension Guide)

本專案將 Discord 事件監聽劃入表現層 (Presentation Layer)，並採取「控制器自治」與「全域錯誤裝飾器 (`discordEventHandler`)」設計。未來若因新需求（如人員進出、討論串建立、身分組變更）需要引入更多常駐 Discord 事件監聽，必須嚴格遵守以下三步擴充規範：

### 第一步：補全 Gateway Intents 權限
編輯 `src/bot.ts` 中的 `Client` 宣告，在 `intents` 陣列中新增對應事件的權限：
* **人員進出事件** (`Events.GuildMemberAdd` / `Remove`)：需要 **`GatewayIntentBits.GuildMembers`** (特權 Intent，需在網頁後台手動開啟)。
* **討論串/身分組變更**：需要 **`GatewayIntentBits.Guilds`**。

### 第二步：在 `src/controllers/` 下建立專屬事件控制器
建立一個自治的事件控制器（如 `memberController.ts`），暴露 `setup` 初始化掛載函數。
**開發規範**：
1. **必須**使用 `discordEventHandler('事件名稱', async (參數) => { ... })` 裝飾器包裹回調函數。
2. **禁止**在控制器中重複編寫 `try-catch` 機制，所有未預期異常應直接向外拋出，由 `discordEventHandler` 自動捕獲並發送 Webhook 警報，同時對支援的交互進行失敗反饋。
3. 具體業務邏輯**嚴禁寫在控制器中**，必須引進三層架構委派給 `Service` 處理。

* **範例 (以人員加入 `GuildMemberAdd` 為例)**：
  新建 `src/controllers/memberController.ts`：
  ```typescript
  import { Client, Events, GuildMember } from 'discord.js';
  import { discordEventHandler } from '../utils/discordEventHandler';
  import { authService } from '../services/authService'; // 假設的業務 Service

  /**
   * 處理成員新加入邏輯 (業務邏輯，直接拋出錯誤，無需 try-catch)
   */
  export async function handleMemberAdd(member: GuildMember): Promise<void> {
    console.log(`[MemberController] 👤 新成員加入: ${member.user.tag}`);
    
    // 委派至業務層 (BLL) 進行資料庫記錄或身分組指派
    await authService.setupNewMember(member.id);
  }

  /**
   * 註冊監聽自治 setup
   */
  export const setupMemberController = (client: Client) => {
    client.on(
      Events.GuildMemberAdd,
      discordEventHandler('GuildMemberAdd', async (member) => {
        await handleMemberAdd(member);
      })
    );
  };
  ```

### 第三步：在 `bot.ts` 中一鍵掛載 Controller
編輯 `src/bot.ts` 啟動入口，引入我們剛才實作的 `setup` 函數，傳入 client 實例完成自治事件掛載：
```typescript
import { setupInteractionController } from './controllers/interactionController';
import { setupMessageController } from './controllers/messageController';
import { setupMemberController } from './controllers/memberController'; // 💡 引入新控制器

// 註冊常駐監聽控制器自治 setup
setupInteractionController(client);
setupMessageController(client);
setupMemberController(client); // 💡 一鍵自治掛載
```
