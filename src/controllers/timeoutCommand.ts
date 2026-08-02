import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  GuildTextBasedChannel,
} from 'discord.js';
import timeoutService from '../services/timeoutService';
import { BaseResponse } from '../utils/baseResponse';
import { ICommand } from '../utils/commands';
import { AppError } from '../utils/appError';
import { PermissionGuard } from '../utils/permissionGuard';
import { config } from '../config';

export const timeoutCommand: ICommand = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('單頻道禁言與監獄管理系統')

    // 1. 單頻道區域禁言 (single)
    .addSubcommandGroup((group) =>
      group
        .setName('single')
        .setDescription('當前頻道禁言')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('在當前頻道禁言指定成員')
            .addUserOption((opt) => opt.setName('user').setDescription('目標成員').setRequired(true))
            .addIntegerOption((opt) =>
              opt.setName('minutes').setDescription('禁言分鐘數').setRequired(true).setMinValue(1)
            )
            .addStringOption((opt) =>
              opt.setName('warned').setDescription('是否已警告 (請填是)').setRequired(true)
            )
            .addStringOption((opt) =>
              opt.setName('reason').setDescription('禁言原因').setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('release')
            .setDescription('解除指定成員在當前頻道的禁言')
            .addUserOption((opt) => opt.setName('user').setDescription('目標成員').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('檢視當前頻道禁言成員名單與時間')
        )
    )

    // 2. 全服監獄與隔離 (global)
    .addSubcommandGroup((group) =>
      group
        .setName('global')
        .setDescription('全服監獄與隔離管理')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('將指定成員全服丟監獄或進行特殊隔離')
            .addUserOption((opt) => opt.setName('user').setDescription('目標成員').setRequired(true))
            .addIntegerOption((opt) =>
              opt.setName('minutes').setDescription('分鐘數').setRequired(true).setMinValue(1)
            )
            .addStringOption((opt) =>
              opt
                .setName('type')
                .setDescription('類型')
                .setRequired(true)
                .addChoices(
                  { name: '關押 (Prisoner)', value: 'prisoner' },
                  { name: '特殊隔離 (Special)', value: 'special' }
                )
            )
            .addStringOption((opt) =>
              opt.setName('warned').setDescription('是否已警告 (請填是)').setRequired(true)
            )
            .addStringOption((opt) =>
              opt.setName('reason').setDescription('關押原因').setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('release')
            .setDescription('手動將指定成員從全服監獄中釋放出獄並還原身分組')
            .addUserOption((opt) => opt.setName('user').setDescription('目標成員').setRequired(true))
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('檢視全服監獄/隔離名單與時間'))
    )

    // 3. 系統配置與權限管理 (setting - 僅限技術公務員)
    .addSubcommandGroup((group) =>
      group
        .setName('setting')
        .setDescription('禁言系統設定')
        .addSubcommand((sub) =>
          sub
            .setName('limit')
            .setDescription('設定時間上限 (分鐘)')
            .addStringOption((opt) =>
              opt
                .setName('scope')
                .setDescription('適用範圍')
                .setRequired(true)
                .addChoices(
                  { name: '單頻道禁言 (Single)', value: 'single' },
                  { name: '全服丟監獄 (Global)', value: 'global' }
                )
            )
            .addIntegerOption((opt) =>
              opt.setName('minutes').setDescription('分鐘數').setRequired(true).setMinValue(1)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('set_global_admin')
            .setDescription('新增全域管理權限 (可使用global、single)')
            .addRoleOption((opt) => opt.setName('role').setDescription('身分組').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove_global_admin')
            .setDescription('移除全域管理權限')
            .addRoleOption((opt) => opt.setName('role').setDescription('身分組').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('set_single_admin')
            .setDescription('新增當前頻道的管理權限')
            .addRoleOption((opt) => opt.setName('role').setDescription('身分組').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove_single_admin')
            .setDescription('移除當前頻道的管理權限')
            .addRoleOption((opt) => opt.setName('role').setDescription('身分組').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName('view_config').setDescription('檢視系統設定與管理員身分組配置')
        )
    ),

  annotations: ['受限禁言與監獄系統'],
  subcommandsMetadata: {
    'single/set': { annotations: ['(禁言權限)'] },
    'single/release': { annotations: ['(禁言權限)'] },
    'single/list': { annotations: [] },
    'global/set': { annotations: ['(全服禁言權限)'] },
    'global/release': { annotations: ['(全服禁言權限)'] },
    'global/list': { annotations: [] },
    'setting/limit': { annotations: ['(技術公務員)'] },
    'setting/set_global_admin': { annotations: ['(技術公務員)'] },
    'setting/remove_global_admin': { annotations: ['(技術公務員)'] },
    'setting/set_single_admin': { annotations: ['(技術公務員)'] },
    'setting/remove_single_admin': { annotations: ['(技術公務員)'] },
    'setting/view_config': { annotations: ['(技術公務員)'] },
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = PermissionGuard.guildGuard(interaction);
    const executor = interaction.member as GuildMember;
    const channel = interaction.channel as GuildTextBasedChannel;
    const group = interaction.options.getSubcommandGroup(true);
    const subcommand = interaction.options.getSubcommand(true);

    // 高延遲 DB 防護：提前發送 Defer Reply，預防 3 秒 Interaction Timeout
    await interaction.deferReply({ ephemeral: group === 'setting' });
    const replyMsg = await interaction.fetchReply().catch(() => null);
    const noticeMessageUrl = replyMsg?.url;

    // 強效檢查函式：欄位「是否已警告」必須填寫「是」
    const checkWarnedField = (): string => {
      const warned = interaction.options.getString('warned', true);
      if (warned.trim() !== '是') {
        throw new AppError('欄位「是否已警告」請務必填寫「是」！', 400);
      }
      return '是';
    };

    // ==========================================
    // 1. 設定群組 (setting) - 僅限技術公務員
    // ==========================================
    if (group === 'setting') {
      PermissionGuard.requireRole(
        interaction,
        config.roles.tech,
        '您沒有技術公務員身分組，無法修改設定！'
      );

      if (subcommand === 'limit') {
        const scope = interaction.options.getString('scope', true) as 'single' | 'global';
        const minutes = interaction.options.getInteger('minutes', true);
        await timeoutService.updateSettingLimit(guild, scope, minutes);
        const label = scope === 'single' ? '單頻道禁言' : '全服監獄';
        await BaseResponse.send(
          interaction,
          { content: `成功將 ${label} 的最高時間上限調整為 ${minutes} 分鐘！`, allowedMentions: { parse: [] } }
        );
        return;
      }

      if (subcommand === 'set_global_admin') {
        const role = interaction.options.getRole('role', true);
        await timeoutService.addGlobalAdminRole(guild, role.id);
        await BaseResponse.send(
          interaction,
          { content: `成功新增全域管理權限：${role.name}`, allowedMentions: { parse: [] } }
        );
        return;
      }

      if (subcommand === 'remove_global_admin') {
        const role = interaction.options.getRole('role', true);
        await timeoutService.removeGlobalAdminRole(guild, role.id);
        await BaseResponse.send(
          interaction,
          { content: `成功移除全域管理權限：${role.name}`, allowedMentions: { parse: [] } }
        );
        return;
      }

      if (subcommand === 'set_single_admin') {
        const role = interaction.options.getRole('role', true);
        await timeoutService.addSingleAdminRole(guild, channel.id, role.id);
        await BaseResponse.send(
          interaction,
          { content: `成功為 ${role.name} 設定頻道 <#${channel.id}> 的管理權限！`, allowedMentions: { parse: [] } }
        );
        return;
      }

      if (subcommand === 'remove_single_admin') {
        const role = interaction.options.getRole('role', true);
        await timeoutService.removeSingleAdminRole(guild, channel.id, role.id);
        await BaseResponse.send(
          interaction,
          { content: `成功移除頻道 <#${channel.id}> 的管理權限：${role.name}`, allowedMentions: { parse: [] } }
        );
        return;
      }

      if (subcommand === 'view_config') {
        const embed = await timeoutService.getConfigSummaryEmbed(guild, channel.id);
        await BaseResponse.send(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
        return;
      }
    }

    // ==========================================
    // 2. 單頻道禁言群組 (single)
    // ==========================================
    if (group === 'single') {
      if (subcommand === 'set') {
        const minutes = interaction.options.getInteger('minutes', true);
        const warned = checkWarnedField();
        const reason = interaction.options.getString('reason', true);

        const targetMember = await PermissionGuard.targetGuard(interaction, 'user');

        const prisoner = await timeoutService.jailSingleChannel(
          guild,
          channel,
          executor,
          targetMember,
          minutes,
          warned,
          reason,
          noticeMessageUrl
        );

        const releaseUnix = Math.floor(new Date(prisoner.release_at).getTime() / 1000);
        await BaseResponse.send(
          interaction,
          {
            content: `已成功將 <@${targetMember.id}> 在頻道 <#${channel.id}> 禁言 ${minutes} 分鐘！\n預計解禁時間：<t:${releaseUnix}:R>\n原因：${reason}`,
            allowedMentions: { users: [targetMember.id] }, // 精準 @ 被禁言者
          }
        );
        return;
      }

      if (subcommand === 'release') {
        const targetMember = await PermissionGuard.targetGuard(interaction, 'user');

        await timeoutService.releaseSingleChannel(guild, channel, executor, targetMember);
        await BaseResponse.send(
          interaction,
          {
            content: `已成功解除 <@${targetMember.id}> 在頻道 <#${channel.id}> 的單頻道禁言！`,
            allowedMentions: { users: [targetMember.id] }, // 僅允許 @ 被釋放者
          }
        );
        return;
      }

      if (subcommand === 'list') {
        const payload = await timeoutService.getSinglePrisonerListEmbed(guild, channel.id);
        const options =
          typeof payload === 'string'
            ? { content: payload, allowedMentions: { parse: [] } }
            : { embeds: [payload], allowedMentions: { parse: [] } };
        await BaseResponse.send(interaction, options);
        return;
      }
    }

    // ==========================================
    // 3. 全服監獄與隔離群組 (global)
    // ==========================================
    if (group === 'global') {
      if (subcommand === 'set') {
        const minutes = interaction.options.getInteger('minutes', true);
        const type = interaction.options.getString('type', true) as 'prisoner' | 'special';
        const warned = checkWarnedField();
        const reason = interaction.options.getString('reason', true);

        const targetMember = await PermissionGuard.targetGuard(interaction, 'user');

        const globalJail = await timeoutService.jailGlobal(
          guild,
          executor,
          targetMember,
          minutes,
          type,
          warned,
          reason,
          noticeMessageUrl
        );

        const releaseUnix = Math.floor(new Date(globalJail.release_at).getTime() / 1000);
        const typeLabel = type === 'special' ? '特殊隔離' : '關押';
        await BaseResponse.send(
          interaction,
          {
            content: `已成功將 <@${targetMember.id}> 進行全服${typeLabel} ${minutes} 分鐘！\n預計出獄時間：<t:${releaseUnix}:R>\n原因：${reason}`,
            allowedMentions: { users: [targetMember.id] }, // 精準 @ 被關押者
          }
        );
        return;
      }

      if (subcommand === 'release') {
        const targetMember = await PermissionGuard.targetGuard(interaction, 'user');

        await timeoutService.releaseGlobal(guild, executor, targetMember);
        await BaseResponse.send(
          interaction,
          {
            content: `已成功將 <@${targetMember.id}> 從全服監獄中釋放出獄並還原原始身分組！`,
            allowedMentions: { users: [targetMember.id] }, // 僅允許 @ 被釋放者
          }
        );
        return;
      }

      if (subcommand === 'list') {
        const payload = await timeoutService.getGlobalJailListEmbed(guild);
        const options =
          typeof payload === 'string'
            ? { content: payload, allowedMentions: { parse: [] } }
            : { embeds: [payload], allowedMentions: { parse: [] } };
        await BaseResponse.send(interaction, options);
        return;
      }
    }
  },
};
