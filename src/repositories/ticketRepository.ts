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
}

export const ticketRepository = new TicketRepository();
