import redis from '../utils/redis';
import { RedisKeys } from '../utils/redisKeys';
import { ITicketConfig, ITicketThreadRecord } from '../models/ticket/ticketDTO';

/**
 * 工單系統資料存取層 (DAL)
 */
export class TicketRepository {
  /**
   * 儲存特定頻道的工單面板配置
   *
   * @param config 工單配置實體
   */
  public async saveConfig(config: ITicketConfig): Promise<void> {
    const key = RedisKeys.Cache.ticketConfig(config.guildId, config.channelId);
    await redis.set(key, JSON.stringify(config));
  }

  /**
   * 取得特定頻道的工單面板配置
   *
   * @param guildId 伺服器 ID
   * @param channelId 頻道 ID
   */
  public async getConfig(guildId: string, channelId: string): Promise<ITicketConfig | null> {
    const key = RedisKeys.Cache.ticketConfig(guildId, channelId);
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as ITicketConfig;
    } catch (err) {
      console.error(`[TicketRepository] Failed to parse ticket config for ${channelId}:`, err);
      return null;
    }
  }

  /**
   * 刪除/停用特定頻道的工單面板配置
   * 
   * @param guildId 伺服器 ID
   * @param channelId 頻道 ID
   */
  public async deleteConfig(guildId: string, channelId: string): Promise<void> {
    const key = RedisKeys.Cache.ticketConfig(guildId, channelId);
    await redis.del(key);
  }

  /**
   * 儲存已建立的私人子區工單記錄
   *
   * @param threadId 私人子區 ID
   * @param record 工單子區記錄實體
   */
  public async saveThreadRecord(threadId: string, record: ITicketThreadRecord): Promise<void> {
    const key = RedisKeys.Cache.ticketThread(threadId);
    await redis.set(key, JSON.stringify(record));
  }

  /**
   * 取得指定工單子區的記錄
   *
   * @param threadId 私人子區 ID
   */
  public async getThreadRecord(threadId: string): Promise<ITicketThreadRecord | null> {
    const key = RedisKeys.Cache.ticketThread(threadId);
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as ITicketThreadRecord;
    } catch (err) {
      console.error(`[TicketRepository] Failed to parse ticket thread for ${threadId}:`, err);
      return null;
    }
  }

  /**
   * 刪除指定工單子區記錄
   *
   * @param threadId 私人子區 ID
   */
  public async deleteThreadRecord(threadId: string): Promise<void> {
    const key = RedisKeys.Cache.ticketThread(threadId);
    await redis.del(key);
  }

  /**
   * 記錄使用者目前進行中的工單子區 ID
   *
   * @param guildId 伺服器 ID
   * @param userId 使用者 ID
   * @param threadId 私人子區 ID
   */
  public async setUserActiveTicket(guildId: string, userId: string, threadId: string): Promise<void> {
    const key = RedisKeys.Cache.ticketUserActive(guildId, userId);
    await redis.set(key, threadId);
  }

  /**
   * 取得使用者目前進行中的工單子區 ID
   *
   * @param guildId 伺服器 ID
   * @param userId 使用者 ID
   */
  public async getUserActiveTicket(guildId: string, userId: string): Promise<string | null> {
    const key = RedisKeys.Cache.ticketUserActive(guildId, userId);
    return await redis.get(key);
  }

  /**
   * 清除使用者目前進行中的工單索引
   *
   * @param guildId 伺服器 ID
   * @param userId 使用者 ID
   */
  public async deleteUserActiveTicket(guildId: string, userId: string): Promise<void> {
    const key = RedisKeys.Cache.ticketUserActive(guildId, userId);
    await redis.del(key);
  }

  /**
   * 設定使用者工單關閉後的申請冷卻時間
   *
   * @param guildId 伺服器 ID
   * @param userId 使用者 ID
   * @param cooldownSeconds 冷卻秒數 (例如 3 天 = 259200 秒)
   */
  public async setUserCooldown(guildId: string, userId: string, cooldownSeconds: number): Promise<void> {
    const key = RedisKeys.Cache.ticketUserCooldown(guildId, userId);
    const expireAtMs = Date.now() + cooldownSeconds * 1000;
    await redis.set(key, expireAtMs.toString(), 'EX', cooldownSeconds);
  }

  /**
   * 取得使用者工單冷卻到期毫秒時間戳 (若未處於冷卻中則回傳 null)
   *
   * @param guildId 伺服器 ID
   * @param userId 使用者 ID
   */
  public async getUserCooldownUntil(guildId: string, userId: string): Promise<number | null> {
    const key = RedisKeys.Cache.ticketUserCooldown(guildId, userId);
    const raw = await redis.get(key);
    if (!raw) return null;

    const expireAtMs = Number(raw);
    return Number.isFinite(expireAtMs) ? expireAtMs : null;
  }

  /**
   * 將新建立的工單加入 7 天逾期自動關閉 Sorted Set 排程
   *
   * @param threadId 私人子區 ID
   * @param expireAtMs 預計自動關閉的毫秒時間戳
   */
  public async addPendingAutoClose(threadId: string, expireAtMs: number): Promise<void> {
    const key = RedisKeys.Data.ticketPendingAutoClose();
    await redis.zadd(key, expireAtMs, threadId);
  }

  /**
   * 查詢所有已超過 7 天未關閉的逾期工單 Thread ID
   *
   * @param nowMs 當前毫秒時間戳
   */
  public async getDueAutoCloses(nowMs: number): Promise<string[]> {
    const key = RedisKeys.Data.ticketPendingAutoClose();
    return await redis.zrangebyscore(key, '-inf', nowMs);
  }

  /**
   * 從 Sorted Set 中移除已處理的工單排程記錄
   *
   * @param threadId 私人子區 ID
   */
  public async removePendingAutoClose(threadId: string): Promise<void> {
    const key = RedisKeys.Data.ticketPendingAutoClose();
    await redis.zrem(key, threadId);
  }
}

export const ticketRepository = new TicketRepository();
