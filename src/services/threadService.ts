import { Client, ThreadChannel, SnowflakeUtil, ChannelFlags, Channel, User, EmbedBuilder, Message } from 'discord.js';
import { config } from '../config';
import { AppError } from '../utils/appError';
import { threadRepository } from '../repositories/threadRepository';
import { IThreadSetting } from '../models/db/threadSetting';
import cacheService from './cacheService';
import { RedisKeys } from '../utils/redisKeys';

/**
 * 討論串 / 論壇貼文自動維護與城堡法控制服務 (BLL Coordinator)
 * 專責協調管理 cacheService 與 threadRepository
 */
export class ThreadService {
  private readonly cacheTTLSeconds = 1800; // 詳細設定快取 30 分鐘

  /**
   * 確保與驗證傳入之頻道為 ThreadChannel
   */
  private ensureThreadChannel(channel: Channel | null): ThreadChannel {
    if (!channel || !channel.isThread()) {
      throw new AppError('此指令僅限在討論串或貼文中執行！', 400);
    }
    return channel as ThreadChannel;
  }

  /**
   * 獲取討論串原作者 Snowflake ID
   */
  private async getThreadOwnerId(thread: ThreadChannel): Promise<string> {
    if (thread.ownerId) {
      return thread.ownerId;
    }

    try {
      const starterMsg = await thread.fetchStarterMessage();
      if (starterMsg && starterMsg.author) {
        return starterMsg.author.id;
      }
    } catch (_err) {
      // 忽略抓取 starter message 失敗例外，備用回傳字串
    }

    return '';
  }

  /**
   * 開機冷啟動預熱：自 Supabase 載入全量城堡法討論串 ID 至 Redis 白名單 Set
   */
  public async warmUpActiveThreads(): Promise<void> {
    try {
      const threadIds = await threadRepository.getAllThreadIds();
      if (threadIds.length === 0) {
        console.log('[ThreadService] 尚無任何城堡法設定紀錄，完成冷啟動跳過。');
        return;
      }

      await cacheService.addToSet(RedisKeys.Cache.activeCastleThreadsSet(), ...threadIds);
      console.log(`[ThreadService] 城堡法白名單冷啟動預熱完畢，共載入 ${threadIds.length} 個討論串。`);
    } catch (err: any) {
      console.error('[ThreadService] 冷啟動預熱過程發生例外：', err.message);
    }
  }

  /**
   * 檢查發起人是否為原作者或協作者
   */
  private async isOwnerOrCoworker(thread: ThreadChannel, userId: string, setting?: IThreadSetting | null): Promise<boolean> {
    const ownerId = await this.getThreadOwnerId(thread);
    if (ownerId && ownerId === userId) {
      return true;
    }

    const currentSetting = setting ?? (await this.getThreadSetting(thread.id));
    if (currentSetting && currentSetting.coworker_ids.includes(userId)) {
      return true;
    }

    return false;
  }

  /**
   * 獲取討論串詳細設定 (優先透過快取)
   */
  private async getThreadSetting(threadId: string): Promise<IThreadSetting | null> {
    return cacheService.getOrSet<IThreadSetting | null>(
      {
        key: RedisKeys.Cache.threadSetting(threadId),
        category: RedisKeys.Category.threadSetting,
        ttl: this.cacheTTLSeconds,
      },
      () => threadRepository.getThreadSetting(threadId)
    );
  }

  /**
   * 權限變更後同步更新快取：加入白名單 + 無效化舊詳細快取
   */
  private async syncCacheAfterUpdate(threadId: string): Promise<void> {
    try {
      // 1. 寫入 Redis 白名單 Set (Sticky 只增不刪)
      await cacheService.addToSet(RedisKeys.Cache.activeCastleThreadsSet(), threadId);
      // 2. 刪除舊詳細快取
      await cacheService.deleteByKeys(RedisKeys.Cache.threadSetting(threadId));
    } catch (_err) {
      // 忽略快取同步例外
    }
  }

  /**
   * /threads top 業務邏輯：快速取得討論串第一則訊息連結
   */
  public async getTopPayload(channel: Channel | null): Promise<string> {
    const thread = this.ensureThreadChannel(channel);
    let topUrl = `https://discord.com/channels/${thread.guildId}/${thread.id}/${thread.id}`;

    try {
      const starterMessage = await thread.fetchStarterMessage();
      if (starterMessage) {
        topUrl = starterMessage.url;
      }
    } catch (_err) {
      // 若無法取得 starter message，使用預設討論串首頁 URL
    }

    return `[點擊回到頂部](${topUrl})`;
  }

  /**
   * /threads coworker 業務邏輯：設定或移除協作者 (僅原作者)
   */
  public async manageCoworkerEmbed(
    channel: Channel | null,
    executorId: string,
    action: 'set' | 'unset',
    targetUser: User
  ): Promise<EmbedBuilder> {
    const thread = this.ensureThreadChannel(channel);
    const ownerId = await this.getThreadOwnerId(thread);

    if (executorId !== ownerId) {
      throw new AppError('權限不足：只有帖子原作者可以設定或移除協作者！', 403);
    }

    if (action === 'set') {
      await threadRepository.addCoworker(thread.id, thread.guildId, ownerId, targetUser.id);
      await this.syncCacheAfterUpdate(thread.id);
      return new EmbedBuilder()
        .setTitle('協作者設定完成')
        .setDescription(`已將成員 <@${targetUser.id}> 新增為本貼文之協作者。`)
        .setColor(0x57f287);
    } else {
      await threadRepository.removeCoworker(thread.id, targetUser.id);
      await this.syncCacheAfterUpdate(thread.id);
      return new EmbedBuilder()
        .setTitle('協作者移除完成')
        .setDescription(`已將成員 <@${targetUser.id}> 自本貼文協作者名單中移除。`)
        .setColor(0xfee75c);
    }
  }

  /**
   * /threads lock / unlock 業務邏輯：鎖定或解鎖帖子 (僅原作者與協作者)
   */
  public async setLockStatusEmbed(channel: Channel | null, executorId: string, isLocked: boolean): Promise<EmbedBuilder> {
    const thread = this.ensureThreadChannel(channel);
    const isAllowed = await this.isOwnerOrCoworker(thread, executorId);

    if (!isAllowed) {
      throw new AppError('權限不足：只有帖子原作者與協作者可以鎖定或解鎖帖子！', 403);
    }

    const ownerId = await this.getThreadOwnerId(thread);
    await threadRepository.setLockStatus(thread.id, thread.guildId, ownerId, isLocked);
    await this.syncCacheAfterUpdate(thread.id);

    if (isLocked) {
      return new EmbedBuilder()
        .setTitle('帖子已鎖定')
        .setDescription('本帖子現已進入鎖定模式，僅限原作者與協作者可在此發言。')
        .setColor(0xed4245);
    } else {
      return new EmbedBuilder()
        .setTitle('帖子已解鎖')
        .setDescription('本帖子現已解除鎖定，恢復正常發言狀態。')
        .setColor(0x57f287);
    }
  }

  /**
   * /threads blacklist 業務邏輯：新增或移除黑名單 (僅原作者與協作者)
   */
  public async manageBlacklistEmbed(
    channel: Channel | null,
    executorId: string,
    action: 'set' | 'unset',
    targetUser: User
  ): Promise<EmbedBuilder> {
    const thread = this.ensureThreadChannel(channel);
    const isAllowed = await this.isOwnerOrCoworker(thread, executorId);

    if (!isAllowed) {
      throw new AppError('權限不足：只有帖子原作者與協作者可以管理帖子黑名單！', 403);
    }

    const ownerId = await this.getThreadOwnerId(thread);

    if (action === 'set') {
      await threadRepository.addBlacklist(thread.id, thread.guildId, ownerId, targetUser.id);
      await this.syncCacheAfterUpdate(thread.id);
      return new EmbedBuilder()
        .setTitle('黑名單設定完成')
        .setDescription(`已將成員 <@${targetUser.id}> 加入本貼文黑名單，該成員發言將會被自動刪除。`)
        .setColor(0xed4245);
    } else {
      await threadRepository.removeBlacklist(thread.id, targetUser.id);
      await this.syncCacheAfterUpdate(thread.id);
      return new EmbedBuilder()
        .setTitle('黑名單移除完成')
        .setDescription(`已將成員 <@${targetUser.id}> 自本貼文黑名單中移除。`)
        .setColor(0x57f287);
    }
  }

  /**
   * /threads view_setting 業務邏輯：查看帖子城堡法設定 (僅原作者與協作者)
   */
  public async getViewSettingEmbed(channel: Channel | null, executorId: string): Promise<EmbedBuilder> {
    const thread = this.ensureThreadChannel(channel);
    const setting = await this.getThreadSetting(thread.id);
    const isAllowed = await this.isOwnerOrCoworker(thread, executorId, setting);

    if (!isAllowed) {
      throw new AppError('權限不足：只有帖子原作者與協作者可以查看帖子設定！', 403);
    }

    const ownerId = setting?.owner_id || (await this.getThreadOwnerId(thread));
    const coworkersStr =
      setting?.coworker_ids && setting.coworker_ids.length > 0 ? setting.coworker_ids.map((id) => `<@${id}>`).join(', ') : '無';

    const blacklistStr =
      setting?.blacklist_ids && setting.blacklist_ids.length > 0
        ? setting.blacklist_ids.map((id) => `<@${id}>`).join(', ')
        : '無';

    const lockStatusStr = setting?.is_locked ? '已鎖定 (僅限作者與協作者發言)' : '未鎖定 (正常)';

    return new EmbedBuilder()
      .setTitle(`討論串設定狀態 - #${thread.name}`)
      .addFields(
        { name: '帖子原作者', value: ownerId ? `<@${ownerId}>` : '未知', inline: true },
        { name: '鎖定狀態', value: lockStatusStr, inline: true },
        { name: '協作者名單', value: coworkersStr, inline: false },
        { name: '黑名單成員', value: blacklistStr, inline: false }
      )
      .setColor(0x5865f2);
  }

  /**
   * /threads help 業務邏輯：城堡法說明文件 Embed
   */
  public getHelpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('討論串城堡法回復類功能說明')
      .setDescription('城堡法賦予貼文原作者與協作者貼文自治管理權限，維護優質討論環境。')
      .addFields({
        name: '原作者與協作者快捷操作',
        value:
          '若您是帖子原作者或協作者，在帖子內對特定訊息「回覆」並輸入以下文字：\n' +
          '• ban : 刪除該條訊息\n' +
          '• pin : 釘選該條訊息\n' +
          '• unpin : 取消釘選該條訊息',
      })
      .setColor(0x5865f2);
  }

  /**
   * 事件監聽執法：處理討論串內的訊息 (黑單/鎖定限制與快捷回覆)
   */
  public async handleThreadMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.channel.isThread()) {
      return;
    }

    const thread = message.channel as ThreadChannel;

    // cacheService 詢問 Redis 白名單，若不在白名單中直接放行不查DB
    const hasSetting = await cacheService.isMemberOfSet(RedisKeys.Cache.activeCastleThreadsSet(), thread.id);
    if (!hasSetting) {
      return;
    }

    const authorId = message.author.id;

    // 取得現有討論串設定
    const setting = await this.getThreadSetting(thread.id);
    const isOwnerOrCoworker = await this.isOwnerOrCoworker(thread, authorId, setting);

    // 1. 黑名單執法：發言者若在黑名單中，立即刪除發言
    if (setting?.blacklist_ids.includes(authorId)) {
      try {
        await message.delete();
      } catch (_err) {
        // 忽略刪除訊息權限錯誤
      }
      return;
    }

    // 2. 鎖定執法：若帖子已鎖定且發言者既非原作者也非協作者，立即刪除發言
    if (setting?.is_locked && !isOwnerOrCoworker) {
      try {
        await message.delete();
      } catch (_err) {
        // 忽略刪除訊息權限錯誤
      }
      return;
    }

    // 3. 快捷回覆執法：若為原作者或協作者的回覆訊息
    if (isOwnerOrCoworker && message.reference && message.reference.messageId) {
      const commandText = message.content.trim().toLowerCase();

      if (['ban', 'pin', 'unpin'].includes(commandText)) {
        try {
          const targetMsg = await thread.messages.fetch(message.reference.messageId);

          if (commandText === 'ban') {
            await targetMsg.delete();
            await message.delete();
          } else if (commandText === 'pin') {
            await targetMsg.pin();
            await message.delete();
          } else if (commandText === 'unpin') {
            await targetMsg.unpin();
            await message.delete();
          }
        } catch (err: any) {
          console.error(`[ThreadService] 執行快捷回覆操作 (${commandText}) 失敗:`, err.message);
        }
      }
    }
  }

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
      console.warn(`[ThreadService] 找不到指定的 Guild (${config.guildId})`);
      return;
    }

    console.log(`[ThreadService] 開始掃描 Guild (${guild.name}) 的活躍討論串...`);

    const now = Date.now();
    let archivedCount = 0;

    for (const [_, channel] of guild.channels.cache) {
      if (!channel.isThread()) {
        continue;
      }

      const thread: ThreadChannel = channel;
      const isPinned = thread.flags.has(ChannelFlags.Pinned);
      if (thread.archived || thread.locked || isPinned) {
        continue;
      }

      try {
        if (autoCloseConfig.excludedTagIds.length > 0 && thread.appliedTags) {
          const hasExcludedTag = thread.appliedTags.some((tagId: string) => autoCloseConfig.excludedTagIds.includes(tagId));

          if (hasExcludedTag) {
            console.log(`[ThreadService] 討論串 #${thread.name} (${thread.id}) 包含豁免標籤，跳過歸檔`);
            continue;
          }
        }

        let lastActiveTimestamp = thread.createdTimestamp;

        if (thread.lastMessageId) {
          lastActiveTimestamp = Number(SnowflakeUtil.timestampFrom(thread.lastMessageId));
        } else if (thread.archiveTimestamp) {
          lastActiveTimestamp = thread.archiveTimestamp;
        }

        if (!lastActiveTimestamp) {
          continue;
        }

        const inactiveSeconds = (now - lastActiveTimestamp) / 1000;

        if (inactiveSeconds >= autoCloseConfig.inactiveTimeoutSeconds) {
          console.log(
            `[ThreadService] 討論串 #${thread.name} (${thread.id}) 已不活躍 ${(inactiveSeconds / 3600).toFixed(1)} 小時，執行自動歸檔...`
          );
          await thread.setArchived(true, '自動化維護：討論串長時間無訊息');
          archivedCount++;

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        console.error(`[ThreadService] 處理討論串 #${thread.name} (${thread.id}) 時發生錯誤:`, err.message);
      }
    }

    console.log(`[ThreadService] 討論串掃描與歸檔完畢，本次共歸檔 ${archivedCount} 個討論串。`);
  }
}

export const threadService = new ThreadService();
export default threadService;
