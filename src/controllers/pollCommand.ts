import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { pollService } from '../services/pollService';
import { BaseResponse } from '../utils/baseResponse';
import { PermissionGuard } from '../utils/permissionGuard';

/**
 * /poll 表現層指令控制器
 * 職責：解析 Discord 指令觸發，呼叫 PermissionGuard 衛哨與 pollService (BLL) 取得 Payload 並發送回應
 */
export const pollCommand = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('發起簡易投票'),

  annotations: ['投票'],

  async execute(interaction: ChatInputCommandInteraction) {
    // 衛哨檢查：確保指令在 Discord 伺服器頻道中執行
    PermissionGuard.guildGuard(interaction);

    const payload = pollService.createPollPayload();
    await BaseResponse.send(interaction, payload);
  },
};
