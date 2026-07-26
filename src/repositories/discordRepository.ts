import { Guild, GuildMember, Collection } from 'discord.js';

/**
 * Discord API 與 SDK 資料存取層 (DAL)
 * 負責所有 Discord Gateway / REST API 的讀取，並內建 In-Memory 快取防範 Rate Limit
 */
export class DiscordRepository {
  // 伺服器成員記憶體快取：key 為 guild.id
  private memberCache = new Map<string, { data: Collection<string, GuildMember>; expiresAt: number }>();
  // 併發請求合併 (Promise Collapsing)，避免同一時間重複發起 Gateway Opcode 8 fetch
  private activeMemberRequests = new Map<string, Promise<Collection<string, GuildMember>>>();

  /**
   * 安全獲取全伺服器成員 (強制使用此方法代替原生的 guild.members.fetch())
   * 內建 30 秒 In-Memory 快取與併發防擊穿
   * 
   * @param guild Discord 伺服器
   * @param ttlSeconds 快取有效秒數 (預設 30 秒)
   */
  public async getGuildMembers(guild: Guild, ttlSeconds = 30): Promise<Collection<string, GuildMember>> {
    const key = guild.id;
    const now = Date.now();

    // 1. 檢查記憶體快取是否命中且未過期
    const cached = this.memberCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // 2. 併發防護：若已有相同 Key 的請求正在 fetch，直接共享 Promise
    if (this.activeMemberRequests.has(key)) {
      return this.activeMemberRequests.get(key)!;
    }

    // 3. 觸發 Gateway Opcode 8 fetch 並管理快取生命週期
    const task = guild.members
      .fetch()
      .then((members) => {
        this.memberCache.set(key, {
          data: members,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
        return members;
      })
      .catch((err) => {
        // Fetch 失敗時清空快取記錄，允許下次重新嘗試
        this.memberCache.delete(key);
        throw err;
      })
      .finally(() => {
        this.activeMemberRequests.delete(key);
      });

    this.activeMemberRequests.set(key, task);
    return task;
  }

  /**
   * 清除指定伺服器的成員記憶體快取 (當有大幅度成員異動需強制刷新時使用)
   * @param guildId 伺服器 ID
   */
  public clearGuildMembersCache(guildId: string): void {
    this.memberCache.delete(guildId);
  }
}

export default new DiscordRepository();
