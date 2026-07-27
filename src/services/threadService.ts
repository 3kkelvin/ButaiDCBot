import { Client, ThreadChannel, SnowflakeUtil, ChannelFlags } from 'discord.js';
import { config } from '../config';

/**
 * 討論串 / 論壇貼文自動維護服務 (BLL)
 */
export class ThreadService {
  /**
   * 掃描全伺服器活躍討論串，自動歸檔無訊息且無豁免標籤的貼文
   */
  public async scanAndArchiveInactiveThreads(client: Client): Promise<void> {
    const autoCloseConfig = config.threadAutoClose;
    if (!autoCloseConfig || !autoCloseConfig.enabled) {
      return;
    }

    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
      console.warn(`[ThreadService] ⚠️ 找不到指定的 Guild (${config.guildId})`);
      return;
    }

    console.log(`[ThreadService] 🔍 開始掃描 Guild (${guild.name}) 的活躍討論串...`);

    const now = Date.now();
    let archivedCount = 0;

    // 1. 遍歷快取中所有頻道並找出活躍討論串
    for (const [_, channel] of guild.channels.cache) {
      if (!channel.isThread()) {
        continue;
      }

      const thread: ThreadChannel = channel;

      // 檢查是否已歸檔、已鎖定或已釘選 (Pinned via ChannelFlags)
      const isPinned = thread.flags.has(ChannelFlags.Pinned);
      if (thread.archived || thread.locked || isPinned) {
        continue;
      }

      try {
        // 2. 標籤豁免保護檢查 (Excluded Tags Check)
        if (autoCloseConfig.excludedTagIds.length > 0 && thread.appliedTags) {
          const hasExcludedTag = thread.appliedTags.some((tagId: string) =>
            autoCloseConfig.excludedTagIds.includes(tagId)
          );

          if (hasExcludedTag) {
            console.log(`[ThreadService] 🛡️ 討論串 #${thread.name} (${thread.id}) 包含豁免標籤，跳過歸檔`);
            continue;
          }
        }

        // 3. 計算最後活躍時間 (Last Active Timestamp)
        let lastActiveTimestamp = thread.createdTimestamp;

        if (thread.lastMessageId) {
          // 利用 Snowflake 解析最後訊息發送時間
          lastActiveTimestamp = Number(SnowflakeUtil.timestampFrom(thread.lastMessageId));
        } else if (thread.archiveTimestamp) {
          lastActiveTimestamp = thread.archiveTimestamp;
        }

        if (!lastActiveTimestamp) {
          continue;
        }

        const inactiveSeconds = (now - lastActiveTimestamp) / 1000;

        // 4. 超過設定之不活躍秒數則執行歸檔
        if (inactiveSeconds >= autoCloseConfig.inactiveTimeoutSeconds) {
          console.log(
            `[ThreadService] 📦 討論串 #${thread.name} (${thread.id}) 已不活躍 ${(inactiveSeconds / 3600).toFixed(1)} 小時，執行自動歸檔...`
          );
          await thread.setArchived(true, '自動化維護：討論串長時間無訊息');
          archivedCount++;

          // 溫和限速防止 429 Rate Limit
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        console.error(`[ThreadService] ❌ 處理討論串 #${thread.name} (${thread.id}) 時發生錯誤:`, err.message);
      }
    }

    console.log(`[ThreadService] ✅ 討論串掃描與歸檔完畢，本次共歸檔 ${archivedCount} 個討論串。`);
  }
}

export const threadService = new ThreadService();
export default threadService;
