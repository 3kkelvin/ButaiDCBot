import {
  ChatInputCommandInteraction,
  GuildTextBasedChannel,
  SlashCommandBuilder,
} from 'discord.js';
import { ICommand } from '../utils/commands';
import { PermissionGuard } from '../utils/permissionGuard';
import { config } from '../config';
import { AppError } from '../utils/appError';
import { purgeService } from '../services/purgeService';
import { IPurgeOptions } from '../models/purge/purgeDTO';
import { BaseResponse } from '../utils/baseResponse';
import { DiscordLogger } from '../utils/discordLogger';

/**
 * /purge 指令控制器 (批次抹除特定使用者歷史發言)
 * 專責參數檢核、權限守衛與呼叫業務服務
 */
export const purgeCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('批次清理指定使用者在特定日期區間的群內發言 (僅限技術公務員)')
    .addStringOption((opt) =>
      opt
        .setName('user_id')
        .setDescription('目標使用者 ID (純數字 Snowflake，即使已不在群內亦可)')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('start_date')
        .setDescription('起始日期 (例如 2026-09-01 或 2026-09-01 00:00)')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('end_date')
        .setDescription('結束日期 (例如 2026-09-10 或 2026-09-10 23:59)')
        .setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('指定清理頻道 (選填，未填寫則掃描全伺服器文字頻道)')
        .setRequired(false)
    ),

  annotations: ['技術公務員專用', '訊息歷史清理'],

  /**
   * 執行 /purge 指令
   *
   * @param interaction Discord 斜線指令交互物件
   * @returns Promise<void>
   */
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = PermissionGuard.guildGuard(interaction);

    // 1. 權限檢查：僅限技術公務員
    PermissionGuard.requireRole(
      interaction,
      config.roles.tech,
      '您沒有技術公務員身分組，無法使用歷史訊息清理功能！'
    );

    // 2. 檢查伺服器是否已有運行中的任務
    if (purgeService.hasActiveTask(guild.id)) {
      throw new AppError('目前已有正在執行的清理任務，請先等待其完成或點擊中斷！', 400);
    }

    // 3. 解析與驗證參數
    const targetUserId = interaction.options.getString('user_id', true).trim();
    if (!/^\d{17,20}$/.test(targetUserId)) {
      throw new AppError('目標使用者 ID 必須為 17~20 位數字 Snowflake！', 400);
    }

    const startDateStr = interaction.options.getString('start_date', true);
    const endDateStr = interaction.options.getString('end_date', true);

    const startDate = purgeService.parseInputDate(startDateStr, false);
    const endDate = purgeService.parseInputDate(endDateStr, true);

    if (startDate.getTime() > endDate.getTime()) {
      throw new AppError('起始時間不可晚於結束時間！', 400);
    }

    const channelOption = interaction.options.getChannel('channel');
    const specificChannelId = channelOption ? channelOption.id : undefined;

    const options: IPurgeOptions = {
      targetUserId,
      startDate,
      endDate,
      specificChannelId,
    };

    // 4. 提前延遲回覆，預防交互超時
    await interaction.deferReply({ ephemeral: false });

    // 5. 透過 Service 工廠取得初始面板 Payload 並發送
    const initialPayload = purgeService.createInitialPayload(options, interaction.user.id);
    const replyMsg = await BaseResponse.send(interaction, initialPayload);

    // 6. 背景啟動清理任務，並以 DiscordLogger 保護未預期錯誤
    const interactionChannel = interaction.channel as GuildTextBasedChannel;
    purgeService
      .startPurge(guild, interaction.user.id, interactionChannel, replyMsg, options)
      .catch((err) => {
        DiscordLogger.sendErrorLog({
          message: err?.message || 'PurgeService background task error',
          errorName: 'PurgeBackgroundTaskError',
          stack: err?.stack,
          commandName: 'purge',
          userId: interaction.user.id,
          guildId: guild.id,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'local',
        }).catch(() => null);
      });
  },
};
