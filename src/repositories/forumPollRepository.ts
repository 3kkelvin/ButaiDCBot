import redis from '../utils/redis';
import { RedisKeys } from '../utils/redisKeys';
import { IForumPollConfig } from '../models/forum/forumPollDTO';

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
   * 移除指定論壇頻道的配置
   *
   * @param forumId 論壇頻道 ID
   */
  public async deleteConfig(forumId: string): Promise<void> {
    const key = RedisKeys.Cache.forumPollConfig(forumId);
    await redis.del(key);
  }

  /**
   * 設定使用者是否對論壇通知永不打擾 (Opt-out)
   *
   * @param userId 使用者 ID
   * @param optOut 是否關閉通知
   */
  public async setOptOut(userId: string, optOut: boolean): Promise<void> {
    const key = RedisKeys.Cache.forumPollOptOut(userId);
    if (optOut) {
      await redis.set(key, '1');
    } else {
      await redis.del(key);
    }
  }

  /**
   * 檢查使用者是否已設定永不打擾
   *
   * @param userId 使用者 ID
   */
  public async isOptedOut(userId: string): Promise<boolean> {
    const key = RedisKeys.Cache.forumPollOptOut(userId);
    const result = await redis.get(key);
    return result === '1';
  }
}

export const forumPollRepository = new ForumPollRepository();
