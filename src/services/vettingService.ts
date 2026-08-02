import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ForumChannel,
  GuildMember,
  Message,
  ThreadChannel,
} from 'discord.js';
import { config } from '../config';
import { IVettingRecord, VettingButtonAction, VettingType } from '../models/vetting/vettingDTO';
import { AppError } from '../utils/appError';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import discordRepository from '../repositories/discordRepository';

/**
 * 審核討論串與身份驗證自動化服務層 (BLL)
 */
export class VettingService {
  /**
   * 初始化與監控新建的審核討論串
   *
   * @param thread 新建立的 Thread 討論串
   */
  public async initVettingThread(thread: ThreadChannel): Promise<void> {
    const parentId = thread.parentId;

    let type: VettingType | null = null;
    let requiredApprovals = 1;

    if (parentId === config.vetting.officialVettingForum) {
      // 入群申請
      type = 'official';
      requiredApprovals = 1;
    } else if (parentId === config.vetting.voterVettingForum) {
      // 選民申請
      type = 'voter';
      requiredApprovals = config.vetting.voterRequiredApprovals;
    } else {
      // 非審核論壇頻道，忽視
      return;
    }

    const targetUserId = thread.ownerId || '';
    if (!targetUserId) return;

    const createdAt = Date.now();
    const expireAt = createdAt + config.vetting.reviewTimeoutDays * 86400 * 1000;

    const record: IVettingRecord = {
      threadId: thread.id,
      guildId: thread.guildId,
      targetUserId,
      type,
      approvers: [],
      rejecters: [],
      score: 0,
      requiredApprovals,
      createdAt,
      expireAt,
    };

    // 貼文標題前綴維護：確保新建貼文帶有 [審核中]
    if (!thread.name.includes('[審核中]') && !thread.name.includes('[已通過]') && !thread.name.includes('[已過期]')) {
      await thread.setName(`[審核中] ${thread.name}`).catch(() => null);
    }

    // 建立卡片 Embed 與按鈕列 (未過期前按鈕保持啟用)
    const embed = this.getVettingEmbed(record);
    const row = this.getVettingActionRow(thread.id, false);

    await thread.send({
      content: `申請審核卡片已建立，請申請審核員進行表決：`,
      embeds: [embed],
      components: [row],
    });

    // 私訊通知審核員
    await this.notifyReviewers(thread, type);
  }

  /**
   * 處置按鈕點擊互動
   *
   * @param interaction 按鈕點擊互動
   */
  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const [, action] = interaction.customId.split(':') as [string, VettingButtonAction, string];

    if (!interaction.guild || !interaction.channel || !interaction.channel.isThread()) {
      throw new AppError('此按鈕操作僅能於審核討論串中使用！');
    }

    const member = interaction.member as GuildMember;
    if (!member) {
      throw new AppError('無法讀取成員資訊！');
    }

    // 1. 權限檢查：必須具備審核員身分組
    const reviewerRoleId = config.vetting.reviewerRoleId;
    if (reviewerRoleId && !member.roles.cache.has(reviewerRoleId)) {
      throw new AppError('您沒有審核員權限，無法進行表決！');
    }

    const thread = interaction.channel as ThreadChannel;
    const targetUserId = thread.ownerId || '';

    // 2. 禁止自我審核
    if (interaction.user.id === targetUserId) {
      throw new AppError('您無法為自己的審核討論串進行表決！');
    }

    // 3. 併發鎖保護：鎖定被審核成員 ID
    const lockKey = RedisKeys.Lock.vettingUser(targetUserId);

    await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 10000,
        releaseOnSuccess: true,
      },
      async () => {
        // 從 Message Embed 解析現有紀錄狀態
        const message = interaction.message;
        const record = this.parseRecordFromMessage(message, thread, targetUserId);

        // 檢查是否已過期 (過期是唯一停用按鈕與禁止表決的情況)
        if (Date.now() > record.expireAt) {
          const expiredEmbed = this.getVettingEmbed(record);
          const disabledRow = this.getVettingActionRow(thread.id, true);
          await interaction.update({
            embeds: [expiredEmbed],
            components: [disabledRow],
          });
          await interaction.followUp({ content: '該審核討論串已超過期限，表決已截止！', ephemeral: true });
          return;
        }

        const userId = interaction.user.id;

        if (action === 'approve') {
          // 若已在拒絕清單，先移除
          record.rejecters = record.rejecters.filter((id) => id !== userId);
          if (!record.approvers.includes(userId)) {
            record.approvers.push(userId);
          } else {
            // 已在通過清單 -> 再次點擊代表收回該票 (Toggle Vote)
            record.approvers = record.approvers.filter((id) => id !== userId);
          }
        } else if (action === 'reject') {
          // 若已在贊成清單，先移除
          record.approvers = record.approvers.filter((id) => id !== userId);
          if (!record.rejecters.includes(userId)) {
            record.rejecters.push(userId);
          } else {
            // 已在拒絕清單 -> 再次點擊代表收回該票 (Toggle Vote)
            record.rejecters = record.rejecters.filter((id) => id !== userId);
          }
        }

        // 計算總分數 (支援負分)
        record.score = record.approvers.length - record.rejecters.length;

        // 1. 優先即時更新 UI (確保在 3 秒內完成點擊回應，防範 Rate Limit 阻塞導致未回應)
        const updatedEmbed = this.getVettingEmbed(record);
        const activeRow = this.getVettingActionRow(thread.id, false);

        await interaction.update({
          embeds: [updatedEmbed],
          components: [activeRow],
        });

        // 2. 判定動態身分組切換 (純粹以實時票數 score >= requiredApprovals 進行判定)
        const targetMember = await interaction.guild!.members.fetch(targetUserId).catch(() => null);
        const targetRoleId = record.type === 'official' ? config.roles.official : config.roles.voter;
        const previousRoleId = record.type === 'official' ? config.roles.temporary : config.roles.official;

        let statusChangedMessage = '';
        const isPassed = record.score >= record.requiredApprovals;

        if (isPassed) {
          // 若達標且成員尚未具備目標身分組，執行升級 (先加目標身分組，後拔前置身分組)
          if (targetMember && targetRoleId && !targetMember.roles.cache.has(targetRoleId)) {
            await targetMember.roles.add(targetRoleId).catch(() => null);
            if (previousRoleId) {
              await targetMember.roles.remove(previousRoleId).catch(() => null);
            }
            statusChangedMessage = `恭喜 <@${targetUserId}> 通過審核`;
          }
        } else {
          // 若原先已具備目標身分組但因改投導致降至門檻以下，執行收回 (先加前置身分組，後拔目標身分組)
          if (targetMember && targetRoleId && targetMember.roles.cache.has(targetRoleId)) {
            if (previousRoleId) {
              await targetMember.roles.add(previousRoleId).catch(() => null);
            }
            await targetMember.roles.remove(targetRoleId).catch(() => null);
            statusChangedMessage = `因票數變動（目前票數: ${record.score}/${record.requiredApprovals}），<@${targetUserId}> 的身分組已暫時收回。`;
          }
        }

        if (statusChangedMessage) {
          await thread.send(statusChangedMessage).catch(() => null);
        }
      }
    );
  }

  /**
   * 私訊提醒審核員
   */
  private async notifyReviewers(thread: ThreadChannel, type: VettingType): Promise<void> {
    try {
      const reviewerRoleId = config.vetting.reviewerRoleId;
      if (!reviewerRoleId) return;

      const guild = thread.guild;
      const membersCollection = await discordRepository.getGuildMembers(guild);
      const reviewers = membersCollection.filter((m) => m.roles.cache.has(reviewerRoleId) && !m.user.bot);

      const typeTitle = type === 'official' ? '正式成員審核' : '選民審核';
      const threadUrl = `https://discord.com/channels/${guild.id}/${thread.id}`;

      for (const [, reviewer] of reviewers) {
        reviewer
          .send({
            content: `**[${typeTitle}]** 有新建的審核討論串需要您的表決！\n請點擊連結前往進行審核：${threadUrl}`,
          })
          .catch(() => {
            // 忽略使用者關閉私訊的情形
          });
      }
    } catch (err) {
      console.error('[VettingService] 發送審核員私訊提醒失敗：', err);
    }
  }

  /**
   * 組裝審核卡片 Embed
   */
  public getVettingEmbed(record: IVettingRecord): EmbedBuilder {
    const title = record.type === 'official' ? '正式成員審核' : '選民審核';

    const isExpired = Date.now() > record.expireAt;
    const isPassed = record.score >= record.requiredApprovals;

    let color = 0x3498db; // Pending / 未達標 (藍色)
    if (isPassed) {
      color = 0x57f287; // Approved / 達標 (綠色)
    } else if (isExpired) {
      color = 0xed4245; // Expired / 過期 (紅色)
    }

    const approversText = record.approvers.length > 0 ? record.approvers.map((id) => `<@${id}>`).join(', ') : '無';

    const rejectersText = record.rejecters.length > 0 ? record.rejecters.map((id) => `<@${id}>`).join(', ') : '無';

    const expireSeconds = Math.floor(record.expireAt / 1000);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .addFields(
        { name: '申請成員', value: `<@${record.targetUserId}>`, inline: true },
        { name: '目前票數', value: `${record.score}/${record.requiredApprovals}`, inline: true },
        { name: '期限', value: `<t:${expireSeconds}:R>`, inline: true },
        { name: '通過', value: approversText, inline: false },
        { name: '拒絕', value: rejectersText, inline: false }
      )
      .setTimestamp();

    if (isExpired) {
      embed.setDescription('**審核已通過**');
    } else if (isPassed) {
      embed.setDescription('**審核已通過**（審核員仍可於期限內改投）');
    }

    return embed;
  }

  /**
   * 組裝按鈕元件 ActionRow
   */
  private getVettingActionRow(threadId: string, disabled: boolean): ActionRowBuilder<ButtonBuilder> {
    const approveBtn = new ButtonBuilder()
      .setCustomId(`vetting:approve:${threadId}`)
      .setLabel('通過')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled);

    const rejectBtn = new ButtonBuilder()
      .setCustomId(`vetting:reject:${threadId}`)
      .setLabel('拒絕')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn, rejectBtn);
  }

  /**
   * 從 Message Embed 中解析既有的審核紀錄數據
   */
  private parseRecordFromMessage(message: Message, thread: ThreadChannel, targetUserId: string): IVettingRecord {
    const parentId = thread.parentId;
    const type: VettingType = parentId === config.vetting.officialVettingForum ? 'official' : 'voter';
    const requiredApprovals = type === 'official' ? 1 : config.vetting.voterRequiredApprovals;

    const embed = message.embeds[0];
    if (!embed) {
      return {
        threadId: thread.id,
        guildId: thread.guildId,
        targetUserId,
        type,
        approvers: [],
        rejecters: [],
        score: 0,
        requiredApprovals,
        createdAt: Date.now(),
        expireAt: Date.now() + config.vetting.reviewTimeoutDays * 86400 * 1000,
      };
    }

    const fields = embed.fields || [];
    const getFieldVal = (name: string) => fields.find((f) => f.name === name)?.value || '';

    const approversStr = getFieldVal('通過');
    const approvers = Array.from(approversStr.matchAll(/<@(\d+)>/g)).map((m: RegExpExecArray) => m[1]);

    const rejectersStr = getFieldVal('拒絕');
    const rejecters = Array.from(rejectersStr.matchAll(/<@(\d+)>/g)).map((m: RegExpExecArray) => m[1]);

    // 直接由名單列表重新計算權威票數 (贊成數 - 拒絕數)
    const score = approvers.length - rejecters.length;

    return {
      threadId: thread.id,
      guildId: thread.guildId,
      targetUserId,
      type,
      approvers,
      rejecters,
      score,
      requiredApprovals,
      createdAt: Date.now(),
      expireAt: Date.now() + config.vetting.reviewTimeoutDays * 86400 * 1000,
    };
  }

  /**
   * 背景排程：每小時高效掃描並自動將逾期審核討論串結案與歸檔
   *
   * @param client Discord Client 實例
   */
  public async scanAndExpireThreads(client: Client): Promise<void> {
    const forumIds = [config.vetting.officialVettingForum, config.vetting.voterVettingForum].filter(Boolean);
    const expireTimeoutMs = config.vetting.reviewTimeoutDays * 86400 * 1000;

    for (const forumId of forumIds) {
      try {
        const channel = await client.channels.fetch(forumId).catch(() => null);
        if (!channel || !(channel instanceof ForumChannel)) continue;

        const activeThreads = await channel.threads.fetchActive();

        for (const [, thread] of activeThreads.threads) {
          if (!thread.name.includes('[審核中]')) {
            continue;
          }

          const createdTimestamp = thread.createdTimestamp || Date.now();
          const isExpired = Date.now() - createdTimestamp > expireTimeoutMs;

          if (isExpired) {
            let isFinalApproved = false;

            // 僅對確認逾期的貼文抓取卡片 Message 更新狀態與停用按鈕
            const messages = await thread.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
              const cardMessage = messages.find((m) => m.embeds.length > 0 && m.author.id === client.user?.id);
              if (cardMessage) {
                const targetUserId = thread.ownerId || '';
                const record = this.parseRecordFromMessage(cardMessage, thread, targetUserId);
                record.expireAt = Date.now() - 1000; // 強制標記為已逾期

                isFinalApproved = record.score >= record.requiredApprovals;

                const expiredEmbed = this.getVettingEmbed(record);
                const disabledRow = this.getVettingActionRow(thread.id, true);

                await cardMessage.edit({
                  embeds: [expiredEmbed],
                  components: [disabledRow],
                });
              }
            }

            // 到期統一結案：標題由 [審核中] 改為 [已通過] 或 [已過期]，並自動歸檔
            const cleanName = thread.name.replace('[審核中]', '').trim();
            if (isFinalApproved) {
              await thread.setName(`[已通過] ${cleanName}`).catch(() => null);
              await thread.send('該審核討論串表決期限已屆滿，審核通過，按鈕已停用並自動歸檔。');
            } else {
              await thread.setName(`[已過期] ${cleanName}`).catch(() => null);
              await thread.send('該審核討論串已超過期限，系統自動結案並歸檔。');
            }

            await thread.setArchived(true).catch(() => null);
          }
        }
      } catch (err) {
        console.error(`[VettingService] 掃描論壇 ${forumId} 逾期審核討論串時發生錯誤：`, err);
      }
    }
  }
}

export const vettingService = new VettingService();
