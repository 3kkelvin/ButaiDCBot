# ButaiDCBot 系統架構文件 (Project Architecture)

本文件詳述了 ButaiDCBot 專案的架構設計、三層分層對照、邊緣化資料庫設計、全域快取 (Promise Collapsing) 與分散式鎖的具體實作方案。

---

## 1. 三層式架構與 Discord Bot 映射

在 Discord Bot 專案中，三層式架構的職責流轉如下：

```
                    ┌─────────────────────────┐
                    │      Discord App        │ (指令輸入/事件產生)
                    └────────────┬────────────┘
                                 │ Discord WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. 表現層 Presentation Layer (Bot Interface)                  │
│    - Commands (Slash, Context Menu)                         │
│    - Events (ready, interactionCreate, messageCreate)       │
│    - Components (Buttons, Select Menus, Modals)             │
│    - 職責：解析交互、格式化 Embed/Message 回覆                  │
└────────────────────────┬──────────▲─────────────────────────┘
                         │ DTO      │ DTO
                         ▼          │
┌───────────────────────────────────┴─────────────────────────┐
│ 2. 業務邏輯層 Service Layer (BLL)                           │
│    - Domain Services (Core logic, e.g. AttendanceService)   │
│    - Tech Services (e.g. CacheService, LockService)         │
│    - 職責：商業邏輯運算、快取控制、分散式鎖生命週期控制             │
└────────────────────────┬──────────▲─────────────────────────┘
                         │ DTO/DAO  │ DAO/Entities
                         ▼          │
┌───────────────────────────────────┴─────────────────────────┐
│ 3. 資料存取層 Data Access Layer (DAL)                         │
│    - SupabaseRepository (連線 Postgres 進行 CRUD)            │
│    - DiscordRepository (呼叫 Discord SDK 獲取 Roles/Members)  │
│    - 職責：對外部系統/資料來源的數據讀寫                       │
└────────────────────────┬──────────▲─────────────────────────┘
                         │          │
                         ▼          │
         ┌──────────────────────────┴────────────────┐
         │              外部系統 & 資料庫            │
         │ - Supabase Database (PostgreSQL)          │
         │ - Discord API (Channels, Members, Guilds) │
         └───────────────────────────────────────────┘
```

---

## 2. 邊緣化資料庫與模型設計

### A. DB 邊緣化設計原則
* **不儲存使用者資料**：
  * **本專案不需要在資料庫中儲存任何 Discord 使用者資料**（如帳號、暱稱、身分組關聯等）。所有的 Discord 使用者資訊，必須在運行時直接透過 `DiscordRepository` 向 Discord API 即時查詢。
  * 資料庫中不需要設計 Discord User ID 與內部 UUID 的關聯表。
* **低頻與輕量儲存**：
  * DB 在本專案中屬於「邊緣輔助」角色，僅儲存少數業務記錄（如簽到/簽退時間戳）、伺服器設定 (Configs)、全域快取資料 (Caches) 以及防並發的分散式鎖 (Locks)。
  * 開發時必須保持 Tables schema 極簡，避免過度設計。

### B. Supabase (PostgreSQL) 初始化
* 採用 **Singleton (單例模式)** 管理 Supabase Client。
* 在服務啟動時載入 `process.env.SUPABASE_URL` 與 `process.env.SUPABASE_KEY` 並建立全域連線實例，全域共享同一個 Client。

---

## 3. 全域快取機制 (Global Cache)

為了減少 Discord API 請求次數並提升機器人反應速度，系統實作了一套基於 **PostgreSQL (或記憶體)** 的快取系統，並內建請求合併機制。

### A. 快取表 Schema 設計 (`caches`)
若需要跨重啟持久化快取，可在 Postgres 建立此表：
```sql
CREATE TABLE caches (
    cache_key VARCHAR(255) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_caches_category ON caches(category);
CREATE INDEX idx_caches_expires_at ON caches(expires_at); -- 用於定時清理過期快取
```

### B. 請求合併 (Promise Collapsing) 防止快取擊穿
在並發環境下，當某個高頻快取（如伺服器配置）失效的瞬間，可能會有多個 Discord Command 同時觸發。為了防止所有請求同時衝擊資料庫或外部 API，`CacheService` 應實作 **Promise Collapsing**。

**運作邏輯**：
1. `CacheService.getOrSet(key, category, ttl, fetchCallback)` 被呼叫。
2. 系統檢查當前記憶體中是否已有針對該 `key` 正在執行的非同步載入任務（以 Promise 存在全域的 Map 中）。
3. **若存在**：不重複發送請求，直接 `await` 當前進行中的 Promise，共享其回傳結果。
4. **若不存在**：建立一個新的非同步任務呼叫 `fetchCallback`，將其 Promise 存入 Map。執行完畢後將結果寫入資料庫/快取，並自 Map 中移除。

```typescript
// 實作概念
export class CacheService {
  private activePromises = new Map<string, Promise<any>>();

  async getOrSet<T>(key: string, category: string, ttl: number, fetchCallback: () => Promise<T>): Promise<T> {
    // 1. 嘗試從快取讀取
    const cached = await this.readFromCache(key);
    if (cached) return cached;

    // 2. 檢查是否有正在進行的 Promise
    if (this.activePromises.has(key)) {
      return this.activePromises.get(key) as Promise<T>;
    }

    // 3. 沒有進行中的，建立一個並放入 Map
    const promise = fetchCallback().then(async (result) => {
      await this.writeToCache(key, category, result, ttl);
      this.activePromises.delete(key);
      return result;
    }).catch((err) => {
      this.activePromises.delete(key);
      throw err;
    });

    this.activePromises.set(key, promise);
    return promise;
  }
}
```

---

## 4. 分散式鎖機制 (Distributed Lock)

為了防範 Race Condition（例如：使用者在 Discord 中對某個互動按鈕進行「連點」或快速狂按，或外部 Webhook 同步發送了多筆重複交易請求），系統必須實作通用分散式鎖。

### A. 鎖資料表 Schema (`distributed_locks`)
```sql
CREATE TABLE distributed_locks (
    lock_key VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### B. 鎖生命週期 (runWithLock)
業務層透過 `LockService` 提供的 `runWithLock` 方法包裹核心業務，實作「進入自動加鎖，執行完畢自動解鎖，出錯異常釋放」的閉包設計。

```typescript
export class LockService {
  async runWithLock<T>(lockKey: string, callback: () => Promise<T>): Promise<T> {
    // 1. 嘗試獲得鎖 (利用 Postgres PRIMARY KEY 唯一約束防重)
    try {
      await db.query('INSERT INTO distributed_locks (lock_key) VALUES ($1)', [lockKey]);
    } catch (error: any) {
      // 23505 是 Postgres Unique Violation 錯誤碼，代表已被鎖定
      if (error.code === '23505') {
        throw new AppError('此操作正在處理中，請稍候重試。', 429);
      }
      throw error;
    }

    // 2. 成功取得鎖，執行 Callback
    try {
      const result = await callback();
      return result;
    } finally {
      // 3. 無論執行成功或失敗，一律釋放鎖
      await db.query('DELETE FROM distributed_locks WHERE lock_key = $1', [lockKey]);
    }
  }
}
```
* **自動過期機制**：
  為防伺服器意外重啟導致死鎖，排程任務系統應每 5 分鐘執行一次 `DELETE FROM distributed_locks WHERE created_at < NOW() - INTERVAL '5 minutes'`。

---

## 5. 排程任務系統 (Scheduled Tasks)

排程任務用於處理自動過期鎖、定時清理快取，或是定時發送機器人統計通知等背景任務。

* **核心技術**：基於 `node-cron` 實作。
* **低耦合設計**：
  * `src/utils/scheduler.ts` 作為調度中心，僅負責設定任務頻率 (Cron Expression) 與啟動/停止。
  * 排程任務內部**嚴禁寫任何業務邏輯**，必須直接呼叫對應領域的 `Service`（例如 `await cleaningService.cleanupExpiredLocks()`）。
