# ⚡ Discord API 速率限制 (Rate Limit) 與開發避雷指南

> **【文件說明】**
> 本指南彙整了 Discord API（包含 **Gateway WebSocket** 與 **HTTP REST API**）中最常遇到的速率限制（Rate Limit）門檻、極高風險地雷區、Discord.js 內部快取機制與全專案開發規範，供開發者與系統營運團隊參考查閱。

---

## 🚨 一、 Gateway WebSocket 限制（極易引發斷線/帳號封鎖）

| API 操作 / Opcode | 官方/實務限制門檻 | 影響與地雷說明 |
| :--- | :--- | :--- |
| **Opcode 8<br>(全服成員請求 `fetch()`)** | **同伺服器 30 秒 1 次** | 短時間連點 `/role` 或多次 `fetch()` 會直接拋出 `GatewayRateLimitError`。**本專案強制使用 `DiscordRepository`！** |
| **Opcode 2<br>(Bot 連線認證 `Identify`)** | **每 5 秒 1 次<br>24小時內 1000~2000 次** | **【重度地雷 💣】** 若程式陷入 Crash 頻繁重啟迴圈 (Crash Loop)，短時間連線數十次會導致 Bot Token 被 Discord **暫停封鎖 24 小時**。 |
| **Opcode 3<br>(狀態更新 `Presence`)** | **5 秒內最多 5 次** | 切勿頻繁更換 Bot 的「正在播放/動態狀態」內容。 |
| **Gateway 全域發送封包上限** | **60 秒內最多 120 次** | 包含所有向 WebSocket 發送的封包，平均每秒不能超過 2 次。超過會被強制中斷 WebSocket 連線。 |

---

## 💥 二、 HTTP REST API 限制（常見 HTTP 429 錯誤）

| API 操作端點 | 限制門檻 | 避雷與地雷警告 |
| :--- | :--- | :--- |
| **頻道名稱/主題修改<br>(Update Channel Name/Topic)** | **每個頻道 10 分鐘最多 2 次** | **【重度地雷 💣】** 切勿實作「每 1~5 分鐘把在線人數/時間寫進語音頻道名稱」的功能！10 分鐘內修改第 3 次必定觸發 `429 Too Many Requests`。 |
| **發送私訊 (Send Direct Message)** | **約 2 小時最多 100 封** | **【極危險地雷 💣】** 短時間給大量伺服器成員發送 DM 私訊，會被 Discord 的防垃圾系統判定為 Spam Bot，**機器人 Token 會直接被官方 BAN 掉**！ |
| **同頻道發送訊息 (Send Message)** | **同頻道 5 秒內最多 5 條** | 平均 1 秒只能發 1 條。連續快速發送會被 discord.js 內部排隊或強制退避。 |
| **修改成員身分組 (Add/Remove Role)** | **約每 10 秒最多 10 次** | 批次為全服成員修改身分組時（如全服掃描修復），中間**必須加入 delay (如 500ms~1000ms)**。 |
| **修改使用者暱稱 (Modify Nickname)** | **同伺服器每 10 秒最多 2 次** | 切勿寫迴圈快速幫多名成員修改暱稱。 |
| **全域 HTTP 總請求上限 (Global)** | **每秒最多 50 次 HTTP 請求** | 跨所有 API 端點的總和上限。 |

---

## 🔍 三、 Discord.js 內建快取與 SDK 機制解析

理解 Discord.js 的內部快取原理是避免 Rate Limit 與記憶體暴漲的關鍵：

### 1. `guild.roles.cache` 與 `guild.channels.cache` (0 網路開銷)
* **運作原理**：機器人連線成功 (Ready) 時，Discord Gateway 會將該伺服器的所有身分組 (Roles) 與頻道 (Channels) **全量推送至機器人記憶體**中。
* **背景同步**：當伺服器新增、修改或刪除身分組時，Discord.js 會透過 WebSocket 事件在背景自動更新 `.cache`。
* **開發建議**：讀取 `guild.roles.cache` 是**純記憶體操作 (0 網路開銷)**，不會觸發 Rate Limit，可放心頻繁調用。

### 2. `guild.members` 機制 (高風險 Opcode 8)
* **運作原理**：為防止大型伺服器（數萬名成員）導致機器人記憶體爆掉 (OOM)，Discord **不會**在連線時推送全量成員。預設 `guild.members.cache` 只會保存線上或近期發言的少數成員。
* **限流風險**：當業務需要獲取全伺服器成員時，呼叫 `guild.members.fetch()` 會觸發 **Opcode 8 WebSocket 請求**。Discord 官方對此設定了**「同伺服器 30 秒只能發起 1 次」**的硬性上限。
* **併發災難**：若短時間內多個指令或程序重複執行 `fetch()`，會直接引發 `GatewayRateLimitError` 拋出例外。

---

## 🛡️ 四、 全專案開發規範 (Mandatory Guidelines)

> **⚠️ 核心開發鐵律：**  
> 全專案業務邏輯層 (BLL) **【嚴禁直接呼叫原生的 `guild.members.fetch()`】**！  
> 必須一律透過 `DiscordRepository` 獲取伺服器成員。

### 1. 成員查詢強制使用 `DiscordRepository`
專案已於 `src/repositories/discordRepository.ts` 提供 DAL 安全封裝：
```typescript
import discordRepository from '../repositories/discordRepository';

// ✅ 正確做法：透過 DiscordRepository 獲取成員
const members = await discordRepository.getGuildMembers(guild);
```
* **防護機制**：
  * **In-Memory Cache**：自動提供 30 秒記憶體快取，避免重複打 API。
  * **Request Collapsing (請求併發合併)**：若同時有多個請求傳入，會自動共享同一個未完成的 Promise，確保同時只會有一筆向 Discord 發出的 Fetch 請求。

### 2. 絕不在無間隔迴圈中發送 Discord API
* 批次處理成員、身分組或發送頻道訊息時，應採用 **Queue（佇列）** 並加上適當的 `sleep()` 間隔 (如 500ms)。

### 3. 動態計數頻道名稱更新頻率
* 若有動態人數/統計頻道名稱更新需求，更新頻率**至少必須設定為 10~15 分鐘以上執行一次**。

### 4. 安全處理 HTTP 429
* 系統遇到 `429 Too Many Requests` 時，應讀取 HTTP Header 中的 `Retry-After` 欄位並自動延遲重試，切勿盲目立即重新發送。

---

*文件更新時間：2026-07-25*  
*適用規範：Discord API v10 / Gateway API / Discord.js v14*
