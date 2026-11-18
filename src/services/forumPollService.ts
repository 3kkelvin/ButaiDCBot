import {
  AnyThreadChannel,
  Client,
  EmbedBuilder,
  ForumChannel,
  TextChannel,
} from 'discord.js';
import { forumPollRepository } from '../repositories/forumPollRepository';
import { discordRepository } from '../repositories/discordRepository';
import { pollService } from './pollService';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import { AppError } from '../utils/appError';
import {
  IForumPollSetupDTO,
  IForumDmQueueItem,
} from '../models/forum/forumPollDTO';

/**
 * 私訊每批次發送上限人數 (防止觸發 Discord 濫發私信風控)
 */
const DM_BATCH_SIZE = 20;

/**
 * 論壇發帖自動投票與通知業務服務 (BLL)
 */
export class ForumPollService {
  /**
   * 設定或關閉論壇頻道的自動發起投票與通知
   *
   * @param dto 配置參數 (包含 guildId, forumId, action, mode, roleId, notifyChannelId)
   * @param forumChannel 論壇頻道實例
   * @returns 成功配置之 Embed 回應卡片
   */
  public async setupForumPoll(
    dto: IForumPollSetupDTO,
    forumChannel: ForumChannel
  ): Promise<EmbedBuilder> {
    if (forumChannel.type !== 15) {
      // 15 = ChannelType.GuildForum
      throw new AppError('指定頻道必須為論壇頻道 (GuildForum)！', 400);
    }

    // 1. 處理完全關閉動作 (action === 'off')
    if (dto.action === 'off') {
      await forumPollRepository.deleteConfig(dto.forumId);

      return new EmbedBuilder()
        .setTitle('論壇發帖自動投票與通知已關閉')
        .setColor(0xe74c3c)
        .setDescription(`已完全關閉論壇頻道 <#${forumChannel.id}> 的發帖自動投票與通知功能。`)
        .setTimestamp();
    }

    // 2. 處理啟用/覆蓋動作 (action === 'on')
    if (!dto.mode) {
      throw new AppError('啟用論壇功能時必須指定通知模式 (mode: 私信 / 頻道通知 / 無)！', 400);
    }

    if (dto.mode === 'dm' || dto.mode === 'channel') {
      if (!dto.roleId) {
        throw new AppError('當通知模式設為「私信」或「頻道通知」時，必須指定目標身分組 (role)！', 400);
      }
    }

    if (dto.mode === 'channel' && !dto.notifyChannelId) {
      throw new AppError('當通知模式設為「頻道通知」時，必須指定發送通知的文字頻道 (notify_channel)！', 400);
    }

    // 保存配置 (action: on 會覆蓋原有模式)
    await forumPollRepository.saveConfig({
      guildId: dto.guildId,
      forumId: dto.forumId,
      enabled: true,
      mode: dto.mode,
      roleId: dto.roleId,
      notifyChannelId: dto.notifyChannelId,
      updatedAt: new Date().toISOString(),
    });

    const modeLabels: Record<string, string> = {
      dm: '私信 (每 5 分鐘發送 20 人防風控)',
      channel: '頻道通知 (指定文字頻道發送)',
      none: '無 (僅在貼文內自動發起投票)',
    };

    const embed = new EmbedBuilder()
      .setTitle('論壇發帖自動投票與通知配置完成')
      .setColor(0x00ffcc)
      .setDescription('已成功更新目標論壇頻道的設定，新貼文發布時將自動執行所選模式。')
      .addFields(
        { name: '論壇頻道', value: `<#${forumChannel.id}>`, inline: true },
        { name: '運行狀態', value: '啟用 (已覆蓋舊設定)', inline: true },
        { name: '通知模式', value: modeLabels[dto.mode] || dto.mode, inline: true }
      );

    if (dto.roleId) {
      embed.addFields({ name: '通知身分組', value: `<@&${dto.roleId}>`, inline: true });
    }

    if (dto.notifyChannelId) {
      embed.addFields({ name: '通知文字頻道', value: `<#${dto.notifyChannelId}>`, inline: true });
    }

    return embed.setTimestamp();
  }

  /**
   * 處置新建立的論壇貼文討論串 (Events.ThreadCreate)
   * 1. 於貼文內自動發起投票 (與 /poll 內容和時限一致：48小時、支持/反對/棄權)
   * 2. 依據 mode 執行對應通知流程 (dm: 每5分鐘20人流控 / channel: 指定文字頻道艾特發送 / none: 不發送)
   *
   * @param thread 新建立的討論串實例
   */
  public async handleNewForumThread(thread: AnyThreadChannel): Promise<void> {
    const parentId = thread.parentId;
    if (!parentId) return;

    // 1. 讀取論壇配置，未配置或未啟用則跳過
    const config = await forumPollRepository.getConfig(parentId);
    if (!config || !config.enabled) return;

    // 2. 使用分散式鎖防止重複處理同一貼文
    const lockKey = RedisKeys.Lock.forumPollThread(thread.id);

    await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 60000,
        releaseOnSuccess: true,
      },
      async () => {
        // 3. 在新貼文內自動發起投票 (內容與時限與 /poll 保持完全一致)
        const pollPayload = pollService.createPollPayload();
        if (pollPayload.poll) {
          try {
            await thread.send({
              poll: pollPayload.poll,
            });
            console.log(`[ForumPollService] 成功於貼文 "${thread.name}" 發起自動投票`);
          } catch (pollErr: any) {
            console.error(`[ForumPollService] 貼文自動投票發起失敗:`, pollErr.message);
          }
        }

        // 4. 根據 mode 進行通知分流
        // 模式 A: 無 (none) -> 僅發起投票，不進行任何通知
        if (config.mode === 'none') {
          return;
        }

        // 模式 B: 頻道通知 (channel) -> 在指定文字頻道發送文字消息艾特指定身分組和包含帖子連結的嵌入內容
        if (config.mode === 'channel') {
          if (!config.notifyChannelId || !config.roleId) return;

          const notifyChannel =
            thread.guild.channels.cache.get(config.notifyChannelId) ||
            (await thread.guild.channels.fetch(config.notifyChannelId).catch(() => null));

          if (notifyChannel && notifyChannel instanceof TextChannel) {
            const channelEmbed = new EmbedBuilder()
              .setTitle('論壇新貼文通知')
              .setDescription(`請跳轉至 [${thread.name}](${thread.url})！`)
              .setColor(0x00ffcc)
              .setTimestamp();

            await notifyChannel.send({
              content: `<@&${config.roleId}>`,
              embeds: [channelEmbed],
            });
          }
          return;
        }

        // 模式 C: 私信 (dm) -> 針對指定身分組成員發送私信，並導入每 5 分鐘發送 20 人的流控限制
        if (config.mode === 'dm') {
          if (!config.roleId) return;

          const guild = thread.guild;
          const membersCollection = await discordRepository.getGuildMembers(guild);

          // 過濾出擁有該身分組的非機器人成員 ID 清單
          const targetUserIds = Array.from(membersCollection.values())
            .filter((m) => !m.user.bot && m.roles.cache.has(config.roleId!))
            .map((m) => m.id);

          if (targetUserIds.length === 0) return;

          // 預先組裝私訊 Embed (拔除所有按鈕功能)
          const dmEmbed = new EmbedBuilder()
            .setTitle('論壇新貼文通知')
            .setDescription(`請跳轉至 [${thread.name}](${thread.url})！`)
            .setColor(0x00ffcc)
            .setTimestamp();

          // 第一批：立即發送最多 20 人
          const firstBatchUserIds = targetUserIds.slice(0, DM_BATCH_SIZE);
          const remainingUserIds = targetUserIds.slice(DM_BATCH_SIZE);

          for (const userId of firstBatchUserIds) {
            try {
              const member = membersCollection.get(userId);
              if (member) {
                await member.send({ embeds: [dmEmbed] });
              }
            } catch (dmErr: any) {
              if (dmErr.code === 50007) {
                console.warn(`[ForumPollService] 成員 ${userId} 關閉了私訊接收，安全略過。`);
              } else {
                console.error(`[ForumPollService] 私訊發送至 ${userId} 失敗:`, dmErr.message);
              }
            }
          }

          // 超過 20 人的剩餘成員，推入 Redis 隊列，由排程中心每 5 分鐘發送 20 人
          if (remainingUserIds.length > 0) {
            const queueItem: IForumDmQueueItem = {
              id: `${thread.id}_${Date.now()}`,
              guildId: guild.id,
              threadId: thread.id,
              threadName: thread.name,
              threadUrl: thread.url,
              remainingUserIds,
              createdAt: Date.now(),
            };

            await forumPollRepository.pushDmQueue(queueItem);
            console.log(
              `[ForumPollService] 已將貼文 "${thread.name}" 的 ${remainingUserIds.length} 位剩餘私訊對象推入流控隊列 (每 5 分鐘 20 人)`
            );
          }
        }
      }
    );
  }

  /**
   * 定期處理私訊流控隊列 (由 Scheduler 排程器每 5 分鐘驅動一次，每次處理最多 20 人)
   *
   * @param client Discord 客戶端實例
   */
  public async processDmQueue(client: Client): Promise<void> {
    const queueItem = await forumPollRepository.popDmQueue();
    if (!queueItem) return;

    const { threadName, threadUrl, remainingUserIds } = queueItem;
    if (!remainingUserIds || remainingUserIds.length === 0) return;

    // 本次批次取出最多 20 人發送
    const currentBatch = remainingUserIds.slice(0, DM_BATCH_SIZE);
    const nextRemaining = remainingUserIds.slice(DM_BATCH_SIZE);

    const dmEmbed = new EmbedBuilder()
      .setTitle('論壇新貼文通知')
      .setDescription(`請跳轉至 [${threadName}](${threadUrl})！`)
      .setColor(0x00ffcc)
      .setTimestamp();

    for (const userId of currentBatch) {
      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user && !user.bot) {
          await user.send({ embeds: [dmEmbed] });
        }
      } catch (dmErr: any) {
        if (dmErr.code === 50007) {
          console.warn(`[ForumPollService Queue] 用戶 ${userId} 關閉了私訊接收，安全略過。`);
        } else {
          console.error(`[ForumPollService Queue] 隊列發送私訊至 ${userId} 失敗:`, dmErr.message);
        }
      }
    }

    console.log(
      `[ForumPollService Queue] 已完成一批 ${currentBatch.length} 人私訊發送，剩餘待發送: ${nextRemaining.length} 人`
    );

    // 若該貼文還有剩餘名額，放回隊列中供 5 分鐘後的下一輪排程消費
    if (nextRemaining.length > 0) {
      queueItem.remainingUserIds = nextRemaining;
      await forumPollRepository.requeueDmItem(queueItem);
    }
  }
}

export const forumPollService = new ForumPollService();
