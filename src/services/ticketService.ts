import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  TextChannel,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import { ticketRepository } from '../repositories/ticketRepository';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import { AppError } from '../utils/appError';
import { PermissionGuard } from '../utils/permissionGuard';
import { BaseResponse } from '../utils/baseResponse';
import { config } from '../config';
import { ITicketSetupDTO } from '../models/ticket/ticketDTO';

/**
 * 工單系統業務邏輯層 (BLL)
 */
export class TicketService {
  /**
   * 設定指定頻道為工單面板頻道或完全停用該頻道工單功能
   *
   * @param dto 工單面板配置參數 (包含 guildId, channelId, action, roleIds)
   * @param guild Discord 伺服器實例
   * @param channel 目標文字頻道
   * @returns 成功配置之 Embed 回應卡片
   */
  public async setupTicketChannel(
    dto: ITicketSetupDTO,
    guild: Guild,
    channel: TextChannel
  ): Promise<EmbedBuilder> {
    if (channel.type !== ChannelType.GuildText) {
      throw new AppError('工單頻道必須為伺服器文字頻道 (GuildText)！', 400);
    }

    // 1. 處理完全停用動作 (action === 'off')
    if (dto.action === 'off') {
      await ticketRepository.deleteConfig(dto.guildId, dto.channelId);

      return new EmbedBuilder()
        .setTitle('工單功能已停用')
        .setColor(0xe74c3c)
        .setDescription(`已完全停用頻道 <#${channel.id}> 的工單申請功能。`)
        .setTimestamp();
    }

    // 2. 處理啟用/覆蓋動作 (action === 'on')
    if (!dto.roleIds || dto.roleIds.length === 0) {
      throw new AppError('啟用工單功能時必須指定至少一個工單處理身分組 (roll)！', 400);
    }

    // 組裝面板 Embed (完全依據需求文案且無 Emoji)
    const panelEmbed = new EmbedBuilder()
      .setTitle('建立工单')
      .setDescription('有任何需求，意见，投诉，询问都可以在这里申请')
      .setColor(0x3498db)
      .setFooter({ text: '點擊下方按鈕以開啟私人客服諮詢子區' });

    // 組裝申請按鈕
    const panelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_apply_${channel.id}`)
        .setLabel('申请')
        .setStyle(ButtonStyle.Primary)
    );

    // 發送面板至該頻道
    await channel.send({
      embeds: [panelEmbed],
      components: [panelRow],
    });

    // 持久化保存工單頻道與身分組配置 (覆蓋原有設定)
    await ticketRepository.saveConfig({
      guildId: guild.id,
      channelId: channel.id,
      enabled: true,
      roleIds: dto.roleIds,
      updatedAt: new Date().toISOString(),
    });

    return new EmbedBuilder()
      .setTitle('工單面板設定成功')
      .setColor(0x3498db)
      .setDescription(`已於 <#${channel.id}> 成功部署工單申請面板！(已覆蓋原有設定)`)
      .addFields(
        { name: '運行狀態', value: '啟用 (on)', inline: true },
        {
          name: '管理與通知身分組',
          value: dto.roleIds.map((id) => `<@&${id}>`).join(' '),
          inline: false,
        }
      )
      .setTimestamp();
  }

  /**
   * 處理開票人點擊「申請」按鈕 (建立私人子區並通知指定身分組與開票人)
   *
   * @param interaction 按鈕點擊交互
   */
  public async handleApplyButton(interaction: ButtonInteraction): Promise<void> {
    const guild = interaction.guild;
    const channel = interaction.channel;

    if (!guild || !channel || !(channel instanceof TextChannel)) {
      throw new AppError('無效的工單頻道操作！', 400);
    }

    // 取得工單配置，若已停用或未配置則拒絕申請
    const ticketConfig = await ticketRepository.getConfig(guild.id, channel.id);
    if (!ticketConfig || !ticketConfig.enabled) {
      throw new AppError('此頻道的工單功能目前已關閉！', 400);
    }

    // 防連點互斥鎖
    const lockKey = RedisKeys.Lock.ticketCreate(interaction.user.id);
    await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 5000,
        releaseOnSuccess: true,
      },
      async () => {
        const roleIds = ticketConfig.roleIds || [];

        // 1. 建立私人子區 (Private Thread)
        const timestampSuffix = Date.now().toString().slice(-4);
        const threadName = `工單-${interaction.user.username}-${timestampSuffix}`;

        const thread = await channel.threads.create({
          name: threadName,
          type: ChannelType.PrivateThread,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          invitable: false,
        });

        // 2. 將開票人加入該私人子區
        await thread.members.add(interaction.user.id);

        // 3. 在子區內艾特通知指定身分組和開票人
        const roleMentions = roleIds.map((id) => `<@&${id}>`).join(' ');
        const notificationContent = `<@${interaction.user.id}> ${roleMentions}`.trim();

        const ticketNoticeEmbed = new EmbedBuilder()
          .setTitle('工單已開啟')
          .setDescription(
            `您好 <@${interaction.user.id}>，客服與管理人員已收到通知！\n請在此詳細說明您的需求、意見、投訴或詢問，我們將盡快為您處置。`
          )
          .setColor(0x3498db)
          .setFooter({ text: '客服團隊與管理身分組人員可於諮詢結束後點擊下方按鈕結案。' })
          .setTimestamp();

        const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_close_${thread.id}_${interaction.user.id}`)
            .setLabel('關閉工單')
            .setStyle(ButtonStyle.Danger)
        );

        await thread.send({
          content: notificationContent,
          embeds: [ticketNoticeEmbed],
          components: [closeRow],
        });

        // 4. 儲存工單子區記錄
        await ticketRepository.saveThreadRecord(thread.id, {
          guildId: guild.id,
          channelId: channel.id,
          threadId: thread.id,
          creatorId: interaction.user.id,
          roleIds,
          createdAt: new Date().toISOString(),
        });

        // 5. 隱密通知開票人跳轉至子區 (使用 BaseResponse 統一處置)
        await BaseResponse.send(
          interaction,
          `您的工單已建立！請前往私人子區諮詢：<#${thread.id}>`,
          true
        );
      }
    );
  }

  /**
   * 處理點擊「關閉工單」按鈕 (檢查指定身分組權限、移除開票人並關閉子區)
   *
   * @param interaction 按鈕點擊交互
   */
  public async handleCloseButton(interaction: ButtonInteraction): Promise<void> {
    const thread = interaction.channel;
    if (!thread || !thread.isThread()) {
      throw new AppError('此操作僅能在工單子區內執行！', 400);
    }

    // 解析 CustomId: ticket_close_{threadId}_{creatorId}
    const parts = interaction.customId.split('_');
    const threadId = parts[2] || thread.id;
    const creatorId = parts[3];

    const lockKey = RedisKeys.Lock.ticketClose(threadId);
    await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 10000,
        releaseOnSuccess: true,
      },
      async () => {
        // 1. 取得子區紀錄
        const record = await ticketRepository.getThreadRecord(threadId);

        // 2. 身分組權限檢查：僅限指定身分組、技術公務員或管理員可關閉
        const allowedRoles = [...(record?.roleIds || []), config.roles.tech];
        const isAllowed =
          PermissionGuard.hasRole(interaction, allowedRoles) ||
          Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));

        if (!isAllowed) {
          throw new AppError('只有指定身分組的客服或管理人員才能關閉此工單！', 403);
        }

        // 3. 把開票人移除子區
        const targetCreatorId = creatorId || record?.creatorId;
        if (targetCreatorId) {
          await thread.members.remove(targetCreatorId).catch((err) => {
            console.warn(`[TicketService] 移除開票人 ${targetCreatorId} 失敗:`, err.message);
          });
        }

        // 4. 發送關閉紀錄訊息
        await thread.send(`工單已由 <@${interaction.user.id}> 關閉，開票人已被移出子區。`);

        // 5. 鎖定並歸檔子區
        await thread.setLocked(true).catch(() => {});
        await thread.setArchived(true).catch(() => {});

        // 6. 清理記錄
        await ticketRepository.deleteThreadRecord(threadId);

        // 7. 回覆點擊者 (使用 BaseResponse 統一處置)
        await BaseResponse.send(interaction, '工單已關閉並歸檔。', true);
      }
    );
  }
}

export const ticketService = new TicketService();
