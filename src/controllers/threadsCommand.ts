import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { threadService } from '../services/threadService';
import { BaseResponse } from '../utils/baseResponse';
import { ICommand } from '../utils/commands';
import { PermissionGuard } from '../utils/permissionGuard';

export const threadsCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('threads')
    .setDescription('討論串與城堡法控制指令')
    .addSubcommand((subcommand) =>
      subcommand.setName('top').setDescription('快速回到頂端')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('coworker')
        .setDescription('設定或移除帖子協作者')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('選擇操作動作')
            .setRequired(true)
            .addChoices(
              { name: '設定協作者 (set)', value: 'set' },
              { name: '移除協作者 (unset)', value: 'unset' }
            )
        )
        .addUserOption((option) =>
          option.setName('user').setDescription('目標成員').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('lock').setDescription('鎖定帖子，僅原作者與協作者可發言')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('unlock').setDescription('解鎖帖子，恢復大眾發言權限')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('blacklist')
        .setDescription('設定或移除帖子黑名單成員')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('選擇操作動作')
            .setRequired(true)
            .addChoices(
              { name: '加入黑名單 (set)', value: 'set' },
              { name: '移除黑名單 (unset)', value: 'unset' }
            )
        )
        .addUserOption((option) =>
          option.setName('user').setDescription('目標成員').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('view_setting').setDescription('查看本帖子城堡法設定狀態')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('help').setDescription('查看討論串城堡法功能說明')
    ),

  annotations: ['討論串控制'],
  subcommandsMetadata: {
    top: { annotations: ['回到頂端'] },
    coworker: { annotations: ['管理協作者', '(僅原作者)'] },
    lock: { annotations: ['鎖定帖子', '(僅原作者/協作者)'] },
    unlock: { annotations: ['解鎖帖子', '(僅原作者/協作者)'] },
    blacklist: { annotations: ['黑名單管理', '(僅原作者/協作者)'] },
    view_setting: { annotations: ['查看設定'] },
    help: { annotations: ['城堡法說明'] },
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const isEphemeral = subcommand !== 'lock' && subcommand !== 'unlock';

    await interaction.deferReply({ ephemeral: isEphemeral });

    switch (subcommand) {
      case 'top':
        await BaseResponse.send(interaction, await threadService.getTopPayload(interaction.channel));
        break;

      case 'coworker': {
        const action = interaction.options.getString('action', true) as 'set' | 'unset';
        const targetMember = await PermissionGuard.targetGuard(interaction, 'user');
        const embed = await threadService.manageCoworkerEmbed(
          interaction.channel,
          interaction.user.id,
          action,
          targetMember.user
        );
        await BaseResponse.send(interaction, embed);
        break;
      }

      case 'lock':
      case 'unlock': {
        const isLocked = subcommand === 'lock';
        const embed = await threadService.setLockStatusEmbed(
          interaction.channel,
          interaction.user.id,
          isLocked
        );
        await BaseResponse.send(interaction, embed);
        break;
      }

      case 'blacklist': {
        const action = interaction.options.getString('action', true) as 'set' | 'unset';
        const targetMember = await PermissionGuard.targetGuard(interaction, 'user');
        const embed = await threadService.manageBlacklistEmbed(
          interaction.channel,
          interaction.user.id,
          action,
          targetMember.user
        );
        await BaseResponse.send(interaction, embed);
        break;
      }

      case 'view_setting': {
        const embed = await threadService.getViewSettingEmbed(
          interaction.channel,
          interaction.user.id
        );
        await BaseResponse.send(interaction, embed);
        break;
      }

      case 'help': {
        const embed = threadService.getHelpEmbed();
        await BaseResponse.send(interaction, embed);
        break;
      }

      default:
        await BaseResponse.send(interaction, `未知的子指令: ${subcommand}`, true);
    }
  },
};
