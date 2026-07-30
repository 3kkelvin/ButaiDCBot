import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { pingService } from '../services/pingService';
import { PermissionGuard } from '../utils/permissionGuard';
import { config } from '../config';
import { BaseResponse } from '../utils/baseResponse';

/**
 * /ping 表現層指令控制器 (已經過 UI 與業務解耦優化)
 */
export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('檢查機器人是否活著'),

  annotations: ['狀態檢查'],

  async execute(interaction: ChatInputCommandInteraction) {
    const wsPing = interaction.client.ws.ping;
    const message = pingService.getPingStatusMessage(wsPing);
    await BaseResponse.send(interaction, message);
  },
};
