/**
 * 記憶體動態定時排程管理器 (DynamicTimerManager)
 * 基於 Node.js libuv 事件迴圈，實現秒級精準觸發、自動取消與溢位安全防護
 */
export class DynamicTimerManager {
  private static timers = new Map<string, NodeJS.Timeout>();

  /**
   * 註冊/排程一個精準定時任務
   * @param key 任務唯一 Key (例如: `timeout:single:guildId:channelId:userId`)
   * @param executeAt 預計執行的 Date 物件
   * @param action 到期時要執行的非同步 Callback
   */
  public static schedule(key: string, executeAt: Date, action: () => Promise<void>): void {
    // 1. 若該 Key 已存在舊任務，先主動取消 (防記憶體洩漏與重複觸發)
    this.cancel(key);

    const delayMs = executeAt.getTime() - Date.now();

    // 2. 若時間已過，直接非同步觸發
    if (delayMs <= 0) {
      action().catch((err) => console.error(`[DynamicTimerManager] Immediate action error for key ${key}:`, err));
      return;
    }

    // 3. Node.js setTimeout 32-bit 整數溢位防護 (最大約 24.8 天 = 2147483647 ms)
    const MAX_TIMEOUT_MS = 2147483647;
    if (delayMs > MAX_TIMEOUT_MS) {
      // 超過 24.8 天者不排入記憶體 setTimeout，純交由背景 Cron 輪詢保底
      return;
    }

    // 4. 註冊 libuv setTimeout
    const timer = setTimeout(async () => {
      this.timers.delete(key);
      try {
        await action();
      } catch (err) {
        console.error(`[DynamicTimerManager] Action execution error for key ${key}:`, err);
      }
    }, delayMs);

    this.timers.set(key, timer);
  }

  /**
   * 取消指定的定時任務 (例如手動提前解禁/釋放時呼叫)
   */
  public static cancel(key: string): boolean {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(key);
      return true;
    }
    return false;
  }

  /**
   * 查詢任務是否仍在記憶體佇列中
   */
  public static has(key: string): boolean {
    return this.timers.has(key);
  }

  /**
   * 清空所有定時器 (系統關機/測試用)
   */
  public static clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
