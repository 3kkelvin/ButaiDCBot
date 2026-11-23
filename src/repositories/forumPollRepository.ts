import redis from '../utils/redis';
import { RedisKeys } from '../utils/redisKeys';
import { IForumPollConfig, IForumDmQueueItem } from '../models/forum/forumPollDTO';

/**
 * 論壇發帖自動投票與通知資料存取層 (DAL)
 */
export class ForumPollRepository {
  /**
   * 儲存論壇投票與通知配置
   *
   * @param config 論壇配置實體
   */
  public async saveConfig(config: IForumPollConfig): Promise<void> {
    const key = RedisKeys.Cache.forumPollConfig(config.forumId);
    await redis.set(key, JSON.stringify(config));
  }

  /**
   * 取得指定論壇頻道的配置
   *
   * @param forumId 論壇頻道 ID
   */
  public async getConfig(forumId: string): Promise<IForumPollConfig | null> {
    const key = RedisKeys.Cache.forumPollConfig(forumId);
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as IForumPollConfig;
    } catch (err) {
      console.error(`[ForumPollRepository] Failed to parse config for forum ${forumId}:`, err);
      return null;
    }
  }

  /**
   * 移除/完全關閉指定論壇頻道的配置
   *
   * @param forumId 論壇頻道 ID
   */
  public async deleteConfig(forumId: string): Promise<void> {
    const key = RedisKeys.Cache.forumPollConfig(forumId);
    await redis.del(key);
  }

  /**
   * 將待分批發送的私訊任務推入隊列 (List RPush)
   *
   * @param item 私訊隊列任務項目
   */
  public async pushDmQueue(item: IForumDmQueueItem): Promise<void> {
    const key = RedisKeys.Data.forumDmQueue();
    await redis.rpush(key, JSON.stringify(item));
  }

  /**
   * 從隊列取出一個待發送的私訊任務 (List LPop)
   */
  public async popDmQueue(): Promise<IForumDmQueueItem | null> {
    const key = RedisKeys.Data.forumDmQueue();
    const raw = await redis.lpop(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as IForumDmQueueItem;
    } catch (err) {
      console.error('[ForumPollRepository] Failed to parse DM queue item:', err);
      return null;
    }
  }

  /**
   * 將尚未完全發送完畢的私訊任務重新放回隊首或隊尾
   *
   * @param item 私訊隊列任務項目
   */
  public async requeueDmItem(item: IForumDmQueueItem): Promise<void> {
    const key = RedisKeys.Data.forumDmQueue();
    await redis.rpush(key, JSON.stringify(item));
  }

  /**
   * 查詢當前私訊待發送隊列長度
   */
  public async getDmQueueLength(): Promise<number> {
    const key = RedisKeys.Data.forumDmQueue();
    return await redis.llen(key);
  }
}

export const forumPollRepository = new ForumPollRepository();
