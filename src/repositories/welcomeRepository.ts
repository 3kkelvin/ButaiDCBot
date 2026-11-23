import redis from '../utils/redis';
import { RedisKeys } from '../utils/redisKeys';
import { IWelcomeConfig, IPendingDeletionItem } from '../models/welcome/welcomeDTO';

/**
 * 新成員歡迎系統資料存取層 (DAL)
 */
export class WelcomeRepository {
  /**
   * 儲存伺服器歡迎配置
   *
   * @param config 歡迎配置實體
   */
  public async saveConfig(config: IWelcomeConfig): Promise<void> {
    const key = RedisKeys.Cache.welcomeConfig(config.guildId);
    await redis.set(key, JSON.stringify(config));
  }

  /**
   * 取得伺服器歡迎配置
   *
   * @param guildId 伺服器 ID
   */
  public async getConfig(guildId: string): Promise<IWelcomeConfig | null> {
    const key = RedisKeys.Cache.welcomeConfig(guildId);
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as IWelcomeConfig;
    } catch (err) {
      console.error(`[WelcomeRepository] Failed to parse welcome config for guild ${guildId}:`, err);
      return null;
    }
  }

  /**
   * 刪除伺服器歡迎配置
   *
   * @param guildId 伺服器 ID
   */
  public async deleteConfig(guildId: string): Promise<void> {
    const key = RedisKeys.Cache.welcomeConfig(guildId);
    await redis.del(key);
  }

  /**
   * 將待自動刪除的歡迎訊息加入 Sorted Set 排程
   *
   * @param channelId 訊息所在頻道 ID
   * @param messageId 訊息 ID
   * @param deleteAtMs 預計刪除的毫秒時間戳 (3天後)
   */
  public async addPendingDeletion(
    channelId: string,
    messageId: string,
    deleteAtMs: number
  ): Promise<void> {
    const key = RedisKeys.Data.welcomePendingDeletions();
    const memberValue = `${channelId}:${messageId}`;
    await redis.zadd(key, deleteAtMs, memberValue);
  }

  /**
   * 查詢所有已到期（需刪除）的歡迎訊息
   *
   * @param nowMs 當前毫秒時間戳
   */
  public async getDueDeletions(nowMs: number): Promise<IPendingDeletionItem[]> {
    const key = RedisKeys.Data.welcomePendingDeletions();
    const rawItems = await redis.zrangebyscore(key, '-inf', nowMs);

    return rawItems.map((item) => {
      const [channelId, messageId] = item.split(':');
      return {
        channelId,
        messageId,
        raw: item,
      };
    });
  }

  /**
   * 從 Sorted Set 中移除已刪除的訊息紀錄
   *
   * @param rawItem 原始字串值 (channelId:messageId)
   */
  public async removePendingDeletion(rawItem: string): Promise<void> {
    const key = RedisKeys.Data.welcomePendingDeletions();
    await redis.zrem(key, rawItem);
  }

  /**
   * 檢查特定使用者是否已經向該新成員打過招呼
   * 
   * @param targetMemberId 被歡迎的新成員 ID
   * @param userId 點擊打招呼的使用者 ID
   */
  public async hasUserGreeted(targetMemberId: string, userId: string): Promise<boolean> {
    const key = RedisKeys.Data.welcomeGreetedUsers(targetMemberId);
    const result = await redis.sismember(key, userId);
    return result === 1;
  }

  /**
   * 記錄使用者已向該新成員打過招呼 (防止重複打招呼)
   * 
   * @param targetMemberId 被歡迎的新成員 ID
   * @param userId 點擊打招呼的使用者 ID
   * @param ttlSeconds 快取保存秒數 (例如 3 天 = 259200 秒)
   */
  public async recordUserGreet(
    targetMemberId: string,
    userId: string,
    ttlSeconds: number = 259200
  ): Promise<void> {
    const key = RedisKeys.Data.welcomeGreetedUsers(targetMemberId);
    const pipeline = redis.pipeline();
    pipeline.sadd(key, userId);
    pipeline.expire(key, ttlSeconds);
    await pipeline.exec();
  }
}

export const welcomeRepository = new WelcomeRepository();
