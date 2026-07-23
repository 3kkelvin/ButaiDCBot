import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from 'discord.js';
import { roleDividerService } from '../services/roleDividerService';
import { PermissionGuard } from '../utils/permissionGuard';
import { config } from '../config';
import { BaseResponse } from '../utils/baseResponse';
import { ICommand } from '../utils/commands';
import { AppError } from '../utils/appError';

export const roleDividerCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('role_divider_fix')
    .setDescription('手動修復身分組分隔線（辨識含 "[" 與 "]" 之身分組）')
    .addUserOption((option) =>
      option
        .setName('member')
        .setDescription('指定要修復的成員（若不填則修復全伺服器成員）')
        .setRequired(false)
    ),

  annotations: ['身份組分割'],

  async execute(interaction: ChatInputCommandInteraction) {
    // 1. 伺服器環境檢查 
    if (!interaction.guild) {
      throw new AppError('此指令僅限在 Discord 伺服器內使用！', 400);
    }

    // 2. 權限檢查：僅限技術公務員身分組執行
    PermissionGuard.requireRole(interaction, config.roles.tech, '您沒有技術公務員權限，無法執行身分組分隔線修復指令！');

    // 3. 耗時操作先進行 Defer Reply
    await interaction.deferReply({ ephemeral: false });

    // 4. 委派至 BLL 處理業務與生成 Embed
    const targetMember = interaction.options.getMember('member') as GuildMember | null;
    const embed = await roleDividerService.getFixResultEmbed(interaction.guild, targetMember);

    // 5. 表現層安全回應
    await BaseResponse.send(interaction, embed);
  },
};
