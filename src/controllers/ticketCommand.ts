import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { ICommand } from '../utils/commands';
import { ticketService } from '../services/ticketService';
import { BaseResponse } from '../utils/baseResponse';
import { PermissionGuard } from '../utils/permissionGuard';
import { TicketAction } from '../models/ticket/ticketDTO';

/**
 * /ticket 表現層指令控制器
 */
export const ticketCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('工單系統相關管理指令')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('channel')
        .setDescription('設定工單面板頻道與接收通知身分組')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('放置工單申請面板的文字頻道')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('操作動作 (on: 啟用/覆蓋 ; off: 完全關閉)')
            .setRequired(true)
            .addChoices(
              { name: '啟用/覆蓋 (on)', value: 'on' },
              { name: '關閉 (off)', value: 'off' }
            )
        )
        .addRoleOption((option) =>
          option
            .setName('roll')
            .setDescription('接收工單通知的指定身分組 (主要，action 為 on 時生效)')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('roll_2')
            .setDescription('額外通知身分組 2 (可選)')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('roll_3')
            .setDescription('額外通知身分組 3 (可選)')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('roll_4')
            .setDescription('額外通知身分組 4 (可選)')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('roll_5')
            .setDescription('額外通知身分組 5 (可選)')
            .setRequired(false)
        )
    ),

  annotations: ['工單系統'],
  subcommandsMetadata: {
    channel: { annotations: ['申請面板', '多身分組'] },
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = PermissionGuard.guildGuard(interaction);
    PermissionGuard.requireManager(interaction);

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'channel': {
        const channel = interaction.options.getChannel('channel', true) as TextChannel;
        const action = interaction.options.getString('action', true) as TicketAction;

        // 收集所有填寫的身分組 (roll, roll_2 ~ roll_5)
        const roleIds: string[] = [];
        const primaryRole = interaction.options.getRole('roll');
        if (primaryRole) {
          roleIds.push(primaryRole.id);
        }

        for (let i = 2; i <= 5; i++) {
          const extraRole = interaction.options.getRole(`roll_${i}`);
          if (extraRole && !roleIds.includes(extraRole.id)) {
            roleIds.push(extraRole.id);
          }
        }

        await interaction.deferReply({ ephemeral: false });

        const embed = await ticketService.setupTicketChannel(
          {
            guildId: guild.id,
            channelId: channel.id,
            action,
            roleIds: roleIds.length > 0 ? roleIds : undefined,
          },
          guild,
          channel
        );

        await BaseResponse.send(interaction, embed);
        break;
      }

      default:
        await BaseResponse.send(interaction, `未知的子指令: ${subcommand}`, true);
    }
  },
};
