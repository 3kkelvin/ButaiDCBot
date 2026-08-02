---
trigger: always_on
---

# ButaiDCBot 專案架構規範與自動審查指引 (Project Architecture & Review Rules)

本文件定義 ButaiDCBot 專案的軟體架構規範、檔案與命名對齊原則、型別集中管理、防重造輪子標準、架構與文件同步維護規範，以及任務完成後強制執行的「先架構審查、後編譯驗證」流程。所有 AI 代理人與開發者必須嚴格遵守。

---

## 一、 檔案命名與對齊規範 (Naming & Directory Alignment)

程式碼與檔案命名必須嚴格遵照以下對齊原則與格式：

1. **基本命名格式**：
   - **Class / Interface / Enum**：採用 `PascalCase`（如 `RoleService`, `IDiscordUser`）。
   - **變數 / 屬性 / 函式**：採用 `camelCase`（如 `getUserInfo`, `guildId`）。
   - **Discord 指令 / 選項**：底線分隔全小寫（如 `/role identity_check`, `target_user`）。

2. **檔案名稱與層級職責對齊**：
   - **Command (`xxxCommand.ts`)**：檔名對齊【指令大類】（例如：`src/controllers/roleCommand.ts` 對應 `/role` 指令族）。
   - **Controller (`xxxController.ts`)**：檔名對齊【監聽事件大類】（例如：`src/controllers/interactionController.ts` 對應 Interaction 事件，`src/controllers/guildMemberUpdateController.ts` 對應成員異動事件）。
   - **Service (`xxxService.ts`)**：檔名對齊【指令大類 / 業務大類】（例如：`src/services/roleService.ts`）。
   - **Repository (`xxxRepository.ts`)**：檔名對齊【資料表名稱】或【資料來源 / 外部 API 名稱】（例如：`src/repositories/socialCreditRepository.ts` 對應 DB 資料表，`src/repositories/webhookRepository.ts` 對應 Webhook 外部來源）。
   - **Utils (`camelCase.ts`)**：通用公用工具庫（例如：`src/utils/permissionGuard.ts`）。

---

## 二、 型別與介面統一集中管理規範 (Type & Interface Governance)

1. **嚴禁散落手刻 Interface / Type**：
   - **禁止**在 Command, Controller, Service, Repository 等邏輯檔案中散亂定義 `interface` 或 `type`。
2. **集中收納於 `src/models/`**：
   - 所有 DTO, DAO, 全域介面、型別與 Enum **必須統一集中於 `src/models/`** 目錄下（例如：`src/models/role/demeritDTO.ts`）。
   - 所有 DB Entity應該集中收集於 `src/models/db/`。
   - 按業務模組與領域建立子目錄並建立獨立檔案，供跨層引用。
   - 每個型別需要撰寫註解，並獨立匯出。

---

## 三、 三層架構與職責邊界規範 (3-Tier Architecture Principles)

本專案實施務實的三層式架構，各層劃分如下：

1. **表現層 - Command (`src/controllers/xxxCommand.ts`)**
   - **職責**：專責 Discord Slash Command 定義 (`SlashCommandBuilder`)、Option 與 Subcommand 宣告。作為指令入口，將請求分發轉發至 Controller 或 Service。

2. **表現層 - Controller (`src/controllers/xxxController.ts`)**
   - **職責**：對齊監聽事件大類，專責 Discord Gateway 事件監聽或多子指令分發。解析 Discord 交互上下文 (`Interaction`/`Message`)，呼叫 Service 業務邏輯，並執行 `.reply()` / `.followUp()` 交互回應。
   - **全域異步保護**：非同步事件處置**必須**使用 `discordEventHandler` 裝飾器包裹。
   - **⚠️ 禁用行為**：禁止直接存取 Supabase DB，禁止直連外部 API，禁止複雜業務運算。

3. **業務邏輯層 - Service (`src/services/xxxService.ts`)**
   - **職責**：對齊指令/業務大類，承載核心業務運算、分散式鎖 (`runWithLock`)、Redis 快取與 DTO 資料計算。
   - **UI 封裝許可**：允許且鼓勵提供 `getXxxEmbed(...)` UI 工廠方法，將業務結果組裝為 `EmbedBuilder` 回傳，以化簡 Controller 的程式碼。

4. **資料存取層 - Repository (`src/repositories/xxxRepository.ts`)**
   - **職責**：對齊資料表或資料來源名稱。
   - **DB 與外部 API**：所有 Supabase DB 存取與外部第三方 HTTP API (Webhook, 外部服務) **必須**經過 Repository 封裝，隔離外部依賴。
   - **Discord API 封裝原則**：普通直接互動直接處理；僅在需要跨模組封裝、複雜批次查詢或自訂快取時封裝為 Repository，防範過度設計。

---

## 四、 關鍵技術防範與安全規範 (Safety Guardrails)

1. **零硬編碼 ID (Zero Hardcoded IDs)**：
   - 嚴禁寫死 Discord 伺服器 ID (Guild ID)、頻道 ID (Channel ID)、身分組 ID (Role ID)、使用者 ID (User ID)。
   - 所有 ID 與敏感參數必須自 `.env` / `src/config/index.ts` 動態讀取。
2. **Redis Keys & Locks 集中管理**：
   - 全專案所有 Redis Key 與分散式鎖 Key **必須統一於 `src/utils/redisKeys.ts` 的 `RedisKeys` 工廠集中宣告**，嚴禁字串硬編碼。
3. **錯誤分類處置**：
   - 可預期業務異常丟出 `AppError`（用戶友好提示，不觸發報警）；未預期 Error 由 `discordEventHandler` 捕捉並發送 Webhook 警報至開發頻道。
4. **禁止輸出 Emoji (No Emoji Policy)**：
   - 全專案任何程式碼、訊息回應、Embed 卡片與日誌輸出中，**嚴禁使用 Emoji 字符**！採用標準乾淨純文字標示與輸出。
5. **嚴禁無參數全量 `guild.members.fetch()` (No Full Member Fetch)**：
   - 嚴禁不帶參數直接呼叫原生 `guild.members.fetch()` 全量拉取全服成員。
   - 若業務確實需要全伺服器成員資料，**必須統一透由 DAL 層的 `discordRepository.getGuildMembers(guild)` 獲取**。該方法內建 30 秒記憶體快取與 Promise Collapsing 併發防擊穿防護，可防止 Gateway 卡死與 Rate Limit 觸發。

---

## 五、 架構更動與文件同步維護規範 (Architecture Documentation Maintenance)

當專案進行重大重構、新增模組或架構變更時，必須同步維護與追加對應的文檔（採「只增不刪」原則，保留歷史脈絡）：

1. **重大架構 / 系統層級變更**：
   - **更新檔案**：`README.md` 及 `docs/project_architecture.md`
   - **說明**：若引入新系統組件、調整三層架構定義、變更資料庫初始化 (`dbInit`) 或快取/分散式鎖機制，必須同步更新 `docs/project_architecture.md` 之相對應章節。

2. **新增監聽事件大類 / 控制器 (New Event Controllers)**：
   - **更新檔案**：`docs/project_architecture.md`
   - **說明**：必須於 `docs/project_architecture.md` 第 7 章「未來事件監聽擴充指南 (Event Extension Guide)」補充新事件的 Gateway Intents 宣告與 Controller 自治掛載說明。

3. **開發規範與邊界調整 (Development Rules Change)**：
   - **更新檔案**：`docs/development_standards.md` 與 `.agents/rules/ARCHITECTURE.md`
   - **說明**：當調整 TypeScript 型別規範、DAL / Service 邊界或錯誤處置流程時，兩份規範檔案必須同步維持一致。

4. **特定業務模組與營運手冊變更 (Module / Business Guides)**：
   - **更新檔案**：`docs/` 下對應模組文件（如 `docs/ROLE_MANAGEMENT_GUIDE.md`、`docs/DISCORD_RATE_LIMIT_GUIDE.md` 等）
   - **說明**：當特定業務邏輯（如身份組自動修復規則、評分計算機制或 Discord Rate Limit 限流防護）發生變更時，必須更新相對應的專屬手冊。

---

## 六、 任務完成強制驗證與子 Agent 架構審查流程 (Post-Task Mandatory Review)

在完成任何程式碼新增、修改或重構任務後，AI 代理人必須嚴格遵循以下二階段驗證流程：

### 階段一：委派子 Agent 執行架構審查 (Subagent Code Review)

在跑單機編譯前，主 Agent **必須使用 `invoke_subagent` 委派專用審查 Agent** (`Role: Architecture Reviewer`, `Model: pro` 或 `inherit`)，對本次變更 (`git diff`) 對照本規範進行審查。

審查 Agent 必須檢查以下項目並產出報告：
- [ ] **三層架構與對齊命名**：
  - Controller 對齊監聽事件大類，Command/Service 對齊指令大類，Repository 對齊資料表/資料來源。
  - Controller/Command 未直接存取 DB 或直連外部 API。
- [ ] **Interface & Type 集中管理**：邏輯檔案中無私自手刻 Interface/Type，均集中於 `src/models/`。
- [ ] **防重複造輪子 (Utils Check)**：檢查是否有重複實作 `src/utils/` 已存在的現成輪子（例如：`permissionGuard`, `baseResponse`, `redisKeys`, `discordEventHandler`, `appError` 等）。
- [ ] **零硬編碼 ID 與 Redis Keys**：ID 均讀自 config，Key 均透過 `RedisKeys`。
- [ ] **禁止輸出 Emoji 檢核**：程式碼、訊息回應與 Embed 卡片中皆無 Emoji 字符。
- [ ] **禁止無參數全量 `guild.members.fetch()`**：絕無直接呼叫原生 `guild.members.fetch()`，全服成員查詢均統一透過 DAL `discordRepository.getGuildMembers(guild)`。
- [ ] **非同步事件保護**：所有事件控制器均由 `discordEventHandler` 包覆。
- [ ] **文件同步維護檢核**：若異動涉及架構、新控制器或開發規範調整，是否已同步更新 `README.md` 或 `docs/` 下對應文檔。

**通過條件**：唯有當審查子 Agent 回報 `✅ 架構審查通過` 時，方可進入階段二。

---

### 階段二：單機自動化編譯與格式驗證 (Mandatory Code Checks)

當架構審查通過後，依序執行下列單機驗證命令：

1. **程式碼自動格式化 (Code Formatting)**
   - **執行指令**：`npm run format`
2. **語法與品質檢查 (Code Linting)**
   - **執行指令**：`npm run lint`
3. **專案編譯驗證 (Build Verification)**
   - **執行指令**：`npm run build`
