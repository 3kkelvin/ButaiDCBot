# 審核與身份驗證自動化系統說明文件 (Vetting System Guide)

本文件詳細說明 ButaiDCBot 審核與身份驗證自動化系統的模組架構、業務流程、身分組發放邏輯、排程效能優化設計，以及 **業務數據狀態機 (Record Status)** 與 **貼文標題狀態機 (Thread Title)** 的解耦與分離設計。

---

## 一、 模組核心功能簡介

本系統旨在協助 Discord 伺服器管理者與審核員自動化處置成員的升級申請（包含「正式成員審核」與「選民審核」）：
1. **自動化貼文監控與卡片初始化**：當使用者於指定論壇頻道發貼時，系統自動偵測並建立審核卡片 Embed 與「通過/拒絕」互動按鈕。
2. **審核員私訊主動通知**：自動向具備審核員身分組的成員發送 Discord 私訊 (DM)，附帶跳轉連結以提醒表決。
3. **動態身分組切換與改投防護**：
   - 遵從 **「先加後減 (Add-First Rule)」** 原則，防範中間狀態身分組被其他修正服務重置。
   - 允許審核員於 7 天審核期限內隨時改投或收回投票，票數變動若導致低於門檻，系統自動動態收回目標身分組並還原前置身分組。
4. **高併發鎖與安全驗證**：使用 Redis 分散式鎖 (`vettingUser(targetUserId)`) 鎖定申請者 ID，禁止自我表決並防範連點競爭。
5. **長久營運極致效能排程**：背景排程每小時掃描並處理逾期貼文，具備萬筆歷史舊帖零 API 消耗隔離機制。

---

## 二、 單一純數字實時票數架構說明 (Pure Numeric Score Architecture)

**全系統完全基於純數字實時票數與門檻比對 (`score >= requiredApprovals`) 作為單一真理來源 (Single Source of Truth, SSOT)**。

```
+-----------------------------------------------------------------------------------+
|                        審核期限內 (Review Period)                               |
+-----------------------------------------------------------------------------------+
| 實時票數與門檻比對 : isPassed = (approvers.length - rejecters.length >= required)   |
| 身分組即時連動   : 達標即時發放 / 降至門檻以下即時收回 (先加後減)                       |
| 貼文標題 thread.name : [審核中] xxx (固定保持不變，零改名 Rate Limit 負擔)           |
+-----------------------------------------------------------------------------------+
                                        |
                                        | 7 天到期 (排程每小時掃描)
                                        v
+-----------------------------------------------------------------------------------+
|                        到期時 (End of Life / Expired)                          |
+-----------------------------------------------------------------------------------+
| 最終狀態判定     : 以 Message Embed 實時解析出的最新票數 (isFinalApproved)           |
| 按鈕控制         : setDisabled(true) 實體灰掉，禁止後續投票                        |
| 貼文標題轉變     : 最終達標 -> [已通過] xxx / 最終未達標 -> [已過期] xxx            |
| 貼文狀態         : 發送結案提示並呼叫 thread.setArchived(true) 歸檔                   |
+-----------------------------------------------------------------------------------+
```

### 1. 純數字實時票數判定 (Pure Numeric Score)
- 完全由 `score >= requiredApprovals` 計算出 `isPassed`。
- 審核員點擊按鈕或改投時，系統讀取讚成名單與拒絕名單實時重新計算 `score`，並立即連動 `targetMember.roles.add()` 或 `remove()`。

### 2. 貼文標題狀態機 (`thread.name`)
- **設計哲學**：作為使用者視覺標籤與背景排程快速跳過舊貼文的索引。
- **狀態轉變規則**：
  - **審核期間**：標題 **固定保持為 `[審核中] xxx`**。中途不隨點擊或身分組發放而更改標題名稱。
  - **到期時（由背景排程統一轉變）**：
    - 若到期時最終達標：標題由 `[審核中]` 一次性改為 **`[已通過]`**。
    - 若到期時最終未達標：標題由 `[審核中]` 一次性改為 **`[已過期]`**。

### 3. 設計效益
1. **極致簡化 (KISS 原則)**：擺脫狀態機同步成本，防範狀態欄位與實體票數不符的懸空 Bug。
2. **消除 Discord 改名 API Rate Limit**：審核期標題保持 `[審核中]` 徹底解決了連點改名 API 429 阻塞問題。
3. **長久營運巨量歷史舊帖 0 API 消耗**：
   到期結案後標題變為 `[已通過]` 或 `[已過期]` 並被歸檔 (`setArchived(true)`)。背景排程 `scanAndExpireThreads` 的過濾條件僅為：
   ```typescript
   if (!thread.name.includes('[審核中]')) continue;
   ```
   營運數年後累積的上萬筆歷史舊帖、一般討論帖、已結案帖均不包含 `[審核中]`，排程掃描時 **0 次 Message Fetch 消耗、在 1 毫秒內全數秒級跳過**。

---

## 三、 三層架構與模組檔案職責

1. **表現層 - Controller**：
   - `src/controllers/threadController.ts`：監聽 `Events.ThreadCreate`，分發至 `vettingService.initVettingThread`。
   - `src/controllers/buttonController.ts`：攔截 `vetting:` 字首按鈕，分發至 `vettingService.handleButtonInteraction`。
2. **業務邏輯層 - Service**：
   - `src/services/vettingService.ts`：處理卡片初始化、按鈕點擊、身分組升降級、Embed 繪製與 `scanAndExpireThreads` 背景排程。
3. **資料與型別層 - DAL & Model**：
   - `src/repositories/discordRepository.ts`：透過 `getGuildMembers(guild)` 提供內建 30 秒記憶體快取與併發防擊穿的成員查詢。
   - `src/models/vetting/vettingDTO.ts`：集中管理 DTO 介面與 Enum。
4. **排程層 - Scheduler**：
   - `src/utils/scheduler.ts`：註冊每小時 Cron 任務 (`0 * * * *`) 執行 `scanAndExpireThreads`。

---

## 四、 測試與驗證規範

在進行本模組維護或修改時，必須執行以下驗證：
1. **語法與格式**：`npm run format` 與 `npm run lint`
2. **編譯檢查**：`npm run build` (確保 Exit Code 0)
3. **架構審查**：委派子 Agent 進行無 Emoji 檢核、DAL 使用檢核與三層架構對齊檢核。
