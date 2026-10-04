import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  GuildTextBasedChannel,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
  SnowflakeUtil,
} from 'discord.js';
import { IActivePurgeTask, IPurgeOptions, PURGE_BUTTON_PREFIX } from '../models/purge/purgeDTO';
import { AppError } from '../utils/appError';
import { PermissionGuard } from '../utils/permissionGuard';
import { config } from '../config';
import { BaseResponse } from '../utils/baseResponse';

/**
 * 訊息清理與歷史資料抹除業務服務
 * 負責以 Snowflake 高效跳轉搜尋並串流刪除指定發言者的訊息
 */
export class PurgeService {
  /**
   * 伺服器進行中的清理任務映射表 (Key: guildId)
   * 每個伺服器同時僅允許一個清理任務運行，避免 API 競態與 Rate Limit
   */
  private activeTasks: Map<string, IActivePurgeTask> = new Map();

  /**
   * 記錄上次更新進度面板的時間戳記 (避免過度調用 Discord Edit API 觸發 429)
   */
  private lastPanelUpdateTime: Map<string, number> = new Map();

  /**
   * 將指定 Date 時間物件轉換為 Discord Snowflake ID
   *
   * @param date 目標時間物件
   * @returns Snowflake 字串 ID
   */
  public dateToSnowflake(date: Date): string {
    return SnowflakeUtil.generate({ timestamp: date.getTime() }).toString();
  }

  /**
   * 依據 Snowflake ID 反推其建立的時間戳 (毫秒)
   *
   * @param snowflake Snowflake 字串 ID
   * @returns 毫秒級時間戳整數
   */
  public snowflakeToTimestamp(snowflake: string): number {
    return Number(SnowflakeUtil.timestampFrom(snowflake));
  }

  /**
   * 解析使用者輸入的日期字串為 Date 物件
   * 支援 YYYY-MM-DD 與 YYYY-MM-DD HH:mm
   *
   * @param dateStr 日期字串
   * @param isEnd 是否為結束時間 (若是則設至當天 23:59:59.999)
   * @returns 解析完成的 Date 物件
   */
  public parseInputDate(dateStr: string, isEnd: boolean): Date {
    const trimmed = dateStr.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const isDateTime = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed);

    if (!isDateOnly && !isDateTime) {
      throw new AppError(`日期格式不正確: "${dateStr}"。請使用 YYYY-MM-DD 或 YYYY-MM-DD HH:mm (例如: 2026-09-01)`, 400);
    }

    let finalIso = trimmed;
    if (isDateOnly) {
      finalIso = isEnd ? `${trimmed}T23:59:59.999+08:00` : `${trimmed}T00:00:00.000+08:00`;
    } else {
      finalIso = trimmed.replace(' ', 'T') + '+08:00';
    }

    const parsed = new Date(finalIso);
    if (isNaN(parsed.getTime())) {
      throw new AppError(`無法有效解析日期: "${dateStr}"`, 400);
    }

    return parsed;
  }

  /**
   * 取得指定伺服器當前進行中的任務
   *
   * @param guildId 伺服器 ID
   * @returns 進行中的任務物件或 undefined
   */
  public getActiveTask(guildId: string): IActivePurgeTask | undefined {
    return this.activeTasks.get(guildId);
  }

  /**
   * 檢查伺服器是否已有正在運行的清理任務
   *
   * @param guildId 伺服器 ID
   * @returns 是否存在進行中任務
   */
  public hasActiveTask(guildId: string): boolean {
    return this.activeTasks.has(guildId);
  }

  /**
   * 建立進度面板 Embed 卡片
   *
   * @param task 任務物件
   * @param statusText 狀態文字 (如 [執行中] / [已中斷] / [已完成])
   * @returns EmbedBuilder 物件
   */
  public createProgressEmbed(task: IActivePurgeTask, statusText: string): EmbedBuilder {
    const startStr = task.startDate.toISOString().replace('T', ' ').substring(0, 19);
    const endStr = task.endDate.toISOString().replace('T', ' ').substring(0, 19);

    const embed = new EmbedBuilder()
      .setTitle(`[使用者發言清理任務] - ${statusText}`)
      .setColor(task.isCancelled ? 0xed4245 : 0x5865f2)
      .setDescription(
        `目標使用者 ID: ${task.targetUserId}\n` +
          `清理時間範圍: ${startStr} ~ ${endStr} (UTC)\n` +
          `已刪除訊息數: ${task.deletedCount} 則\n` +
          `進度頻道: ${task.scannedChannels} / ${task.totalChannels} (當前: ${task.currentChannelName})\n` +
          `執行者: <@${task.executorId}>`
      )
      .setTimestamp();

    return embed;
  }

  /**
   * 建立中斷按鈕組件
   *
   * @param disabled 是否禁用按鈕
   * @returns ActionRowBuilder 包含中斷按鈕之組件
   */
  public createActionRow(disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const cancelButton = new ButtonBuilder()
      .setCustomId(`${PURGE_BUTTON_PREFIX}:cancel`)
      .setLabel('[中斷清理任務]')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton);
  }

  /**
   * 建立初始面板 Payload，供表現層直接發送
   *
   * @param options 任務選項
   * @param executorId 執行者 ID
   * @returns InteractionReplyOptions 初始回覆 Payload
   */
  public createInitialPayload(options: IPurgeOptions, executorId: string): InteractionReplyOptions {
    const dummyTask: IActivePurgeTask = {
      guildId: '',
      interactionChannelId: '',
      messageId: '',
      targetUserId: options.targetUserId,
      executorId,
      startedAt: new Date(),
      startDate: options.startDate,
      endDate: options.endDate,
      deletedCount: 0,
      scannedChannels: 0,
      totalChannels: options.specificChannelId ? 1 : 0,
      currentChannelName: '正在檢索頻道...',
      isCancelled: false,
    };

    const initialEmbed = this.createProgressEmbed(dummyTask, '[初始化中]');
    const actionRow = this.createActionRow(false);

    return {
      embeds: [initialEmbed],
      components: [actionRow],
    };
  }

  /**
   * 處置按鈕中斷互動事件
   *
   * @param interaction 按鈕互動
   * @returns Promise<void>
   */
  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const guild = PermissionGuard.guildGuard(interaction);

    // 權限檢查：僅限技術公務員可中斷
    PermissionGuard.requireRole(interaction, config.roles.tech, '您沒有技術公務員身分組，無法中斷此任務！');

    const task = this.activeTasks.get(guild.id);
    if (!task) {
      await BaseResponse.sendEphemeral(interaction, '目前伺服器沒有正在執行的清理任務。');
      return;
    }

    if (task.isCancelled) {
      await BaseResponse.sendEphemeral(interaction, '任務已在終止流程中，請稍候。');
      return;
    }

    // 標記取消
    task.isCancelled = true;
    await BaseResponse.sendEphemeral(interaction, '已送出中斷請求！系統將在結束當前單筆處理後停止任務。');
  }

  /**
   * 啟動背景訊息清理主流程
   *
   * @param guild 伺服器物件
   * @param executorId 執行者 User ID
   * @param interactionChannel 執行指令所在的頻道
   * @param progressMessage 初始面板訊息物件
   * @param options 輸入參數
   * @returns Promise<void>
   */
  public async startPurge(
    guild: Guild,
    executorId: string,
    interactionChannel: GuildTextBasedChannel,
    progressMessage: Message,
    options: IPurgeOptions
  ): Promise<void> {
    if (this.activeTasks.has(guild.id)) {
      throw new AppError('伺服器已有正在執行的清理任務，請等待其結束或予以中斷！', 400);
    }

    // 1. 取得需要檢查的候選文字頻道
    const candidateChannels = await this.resolveTargetChannels(guild, options);

    // 2. 初始化任務狀態
    const task: IActivePurgeTask = {
      guildId: guild.id,
      interactionChannelId: interactionChannel.id,
      messageId: progressMessage.id,
      targetUserId: options.targetUserId,
      executorId,
      startedAt: new Date(),
      startDate: options.startDate,
      endDate: options.endDate,
      deletedCount: 0,
      scannedChannels: 0,
      totalChannels: candidateChannels.length,
      currentChannelName: '準備中',
      isCancelled: false,
    };

    this.activeTasks.set(guild.id, task);

    const startSnowflake = this.dateToSnowflake(options.startDate);
    const endSnowflake = this.dateToSnowflake(options.endDate);
    const endTimestamp = options.endDate.getTime();

    try {
      // 3. 逐一巡檢與清理各頻道
      for (const ch of candidateChannels) {
        if (task.isCancelled) {
          break;
        }

        task.currentChannelName = ch.name;
        task.scannedChannels++;
        await this.tryUpdateProgressPanel(interactionChannel, progressMessage, task, '[執行中]');

        await this.purgeMessagesInChannel(
          ch,
          options.targetUserId,
          startSnowflake,
          endSnowflake,
          endTimestamp,
          task,
          interactionChannel,
          progressMessage
        );
      }
    } finally {
      // 4. 清理完成或中斷處置
      const finalStatus = task.isCancelled ? '[已手動中斷]' : '[已全數完成]';
      const finalEmbed = this.createProgressEmbed(task, finalStatus);
      const disabledActionRow = this.createActionRow(true);

      await progressMessage
        .edit({
          embeds: [finalEmbed],
          components: [disabledActionRow],
        })
        .catch(() => null);

      this.activeTasks.delete(guild.id);
      this.lastPanelUpdateTime.delete(guild.id);
    }
  }

  /**
   * 篩選並過濾符合條件的文字頻道列表 (包含權限與頻道生命週期剪枝)
   *
   * @param guild 伺服器物件
   * @param options 清理參數
   * @returns 符合條件的頻道陣列
   */
  private async resolveTargetChannels(guild: Guild, options: IPurgeOptions): Promise<GuildTextBasedChannel[]> {
    const me = guild.members.me;
    if (!me) {
      throw new AppError('無法取得機器人在伺服器中的成員資料！', 500);
    }

    // 若指定單一頻道
    if (options.specificChannelId) {
      const channel = await guild.channels.fetch(options.specificChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        throw new AppError('指定的頻道不存在或非文字頻道！', 400);
      }
      return [channel as GuildTextBasedChannel];
    }

    const allChannels = await guild.channels.fetch();
    const result: GuildTextBasedChannel[] = [];
    const startTimestamp = options.startDate.getTime();
    const endTimestamp = options.endDate.getTime();

    for (const [, ch] of allChannels) {
      if (!ch || !ch.isTextBased()) continue;

      // 檢查機器人具備必要權限
      const permissions = ch.permissionsFor(me);
      if (
        !permissions ||
        !permissions.has(PermissionFlagsBits.ViewChannel) ||
        !permissions.has(PermissionFlagsBits.ReadMessageHistory) ||
        !permissions.has(PermissionFlagsBits.ManageMessages)
      ) {
        continue;
      }

      // 剪枝 1：頻道建立時間若晚於清理結束時間，則該頻道在此區間絕無訊息
      if (ch.createdTimestamp > endTimestamp) {
        continue;
      }

      // 剪枝 2：若頻道最後發言時間小於起始時間，表示在區間前已完全沉寂
      const textCh = ch as GuildTextBasedChannel;
      if (textCh.lastMessageId) {
        const lastMsgTime = this.snowflakeToTimestamp(textCh.lastMessageId);
        if (lastMsgTime < startTimestamp) {
          continue;
        }
      }

      result.push(textCh);
    }

    return result;
  }

  /**
   * 在單一頻道中以 Snowflake 快速定點串流讀取並刪除訊息
   * 嚴格管控記憶體快取釋放
   *
   * @param channel 目標文字頻道
   * @param targetUserId 目標使用者 ID
   * @param startSnowflake 起始 Snowflake ID
   * @param endSnowflake 結束 Snowflake ID
   * @param endTimestamp 結束時間戳 (毫秒)
   * @param task 當前任務物件
   * @param interactionChannel 指令所在頻道
   * @param progressMessage 進度面板訊息物件
   * @returns Promise<void>
   */
  private async purgeMessagesInChannel(
    channel: GuildTextBasedChannel,
    targetUserId: string,
    startSnowflake: string,
    endSnowflake: string,
    endTimestamp: number,
    task: IActivePurgeTask,
    interactionChannel: GuildTextBasedChannel,
    progressMessage: Message
  ): Promise<void> {
    let currentAfter = startSnowflake;

    while (!task.isCancelled) {
      // 使用 after 直接跳轉到指定 Snowflake 之後，避免掃描過往歷史
      const messages = await channel.messages
        .fetch({
          after: currentAfter,
          limit: 100,
        })
        .catch(() => null);

      if (!messages || messages.size === 0) {
        break;
      }

      // 依時間由舊到新排序 (遞增)
      const messageList = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let reachedEnd = false;

      for (const msg of messageList) {
        if (task.isCancelled) {
          reachedEnd = true;
          break;
        }

        // 超過指定結束時間則提早結束此頻道遍歷
        if (msg.createdTimestamp > endTimestamp || BigInt(msg.id) > BigInt(endSnowflake)) {
          reachedEnd = true;
          break;
        }

        // 更新游標為當前訊息 ID
        currentAfter = msg.id;

        // 若為目標使用者的訊息，執行刪除
        if (msg.author.id === targetUserId) {
          try {
            await msg.delete();
            task.deletedCount++;

            // 限流防護：單筆刪除後微幅延遲 800ms
            await this.sleep(800);

            // 節流更新面板
            await this.tryUpdateProgressPanel(interactionChannel, progressMessage, task, '[執行中]');
          } catch (err: unknown) {
            // 若遇到 429 Rate Limit 則等待 retry_after
            const error = err as { status?: number; rawError?: { retry_after?: number } };
            if (error?.status === 429) {
              const retryAfter = (error?.rawError?.retry_after ?? 1) * 1000;
              await this.sleep(retryAfter);
            }
          }
        }
      }

      // ===============================================================
      // 關鍵記憶體防線：立即將本次 fetch 出來的訊息從頻道 Cache 中釋放
      // 保證 Node.js Heap 不隨兩百萬條訊息增長而堆積 Message 物件
      // ===============================================================
      for (const msg of messageList) {
        channel.messages.cache.delete(msg.id);
      }

      if (reachedEnd) {
        break;
      }

      // 若讀取數量少於 100 則代表已達該頻道最新訊息
      if (messageList.length < 100) {
        break;
      }

      // 每次分頁抓取後微幅緩衝 300ms
      await this.sleep(300);
    }
  }

  /**
   * 節流更新進度面板 (間隔至少 3000ms 避免觸發 Discord 429)
   *
   * @param channel 指令頻道
   * @param message 面板訊息物件
   * @param task 當前任務物件
   * @param statusText 狀態標題文字
   * @returns Promise<void>
   */
  private async tryUpdateProgressPanel(
    channel: GuildTextBasedChannel,
    message: Message,
    task: IActivePurgeTask,
    statusText: string
  ): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastPanelUpdateTime.get(task.guildId) ?? 0;

    // 未滿 3 秒則略過本次 UI 更新
    if (now - lastTime < 3000) {
      return;
    }

    this.lastPanelUpdateTime.set(task.guildId, now);

    const embed = this.createProgressEmbed(task, statusText);
    const actionRow = this.createActionRow(false);

    await message
      .edit({
        embeds: [embed],
        components: [actionRow],
      })
      .catch(() => null);
  }

  /**
   * 等待指定毫秒數
   *
   * @param ms 毫秒數
   * @returns Promise<void>
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const purgeService = new PurgeService();
