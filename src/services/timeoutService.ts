import { Guild, GuildMember, GuildTextBasedChannel, TextChannel, Client, EmbedBuilder } from 'discord.js';
import timeoutRepository from '../repositories/timeoutRepository';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import { AppError } from '../utils/appError';
import { DiscordLogger } from '../utils/discordLogger';
import { PermissionGuard } from '../utils/permissionGuard';
import { DynamicTimerManager } from '../utils/dynamicTimerManager';
import { config } from '../config';
import { ITimeoutPrisoner } from '../models/db/timeout/prisoner';
import { ITimeoutGlobalJail } from '../models/db/timeout/globalJail';

export class TimeoutService {
  /**
   * 檢查成員是否為全域管理員 (擁有 Global Admin Role)
   */
  public async isGlobalAdmin(guild: Guild, member: GuildMember): Promise<boolean> {
    const adminRoles = await timeoutRepository.getGlobalAdminRoles(guild.id);
    const adminRoleIds = adminRoles.map((r) => r.role_id);
    if (adminRoleIds.length === 0) return false;

    return PermissionGuard.hasRole(member, adminRoleIds);
  }

  /**
   * 檢查成員是否為指定頻道的 Single Admin
   */
  public async isSingleAdmin(guild: Guild, channelId: string, member: GuildMember): Promise<boolean> {
    if (await this.isGlobalAdmin(guild, member)) return true;

    const singleRoles = await timeoutRepository.getSingleAdminRoles(guild.id, channelId);
    const singleRoleIds = singleRoles.map((r) => r.role_id);
    if (singleRoleIds.length === 0) return false;

    return PermissionGuard.hasRole(member, singleRoleIds);
  }

  /**
   * 取得相應管轄頻道 (若是 ThreadChannel 則導向 Parent Channel)
   */
  private getTargetChannel(channel: GuildTextBasedChannel): TextChannel | GuildTextBasedChannel {
    if (channel.isThread()) {
      if (channel.parent && channel.parent.isTextBased()) {
        return channel.parent as TextChannel;
      }
    }
    return channel;
  }

  /**
   * 發送專用紀錄頻道留檔 (Timeout Log Channel)
   */
  private async sendLogChannel(guild: Guild, embed: EmbedBuilder, allowedUserId?: string): Promise<void> {
    const logChannelId = config.channels.timeoutLog || config.channels.auditLog;
    if (logChannelId) {
      const channel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const allowedMentions = allowedUserId ? { users: [allowedUserId] } : { parse: [] };
        await (channel as TextChannel).send({ embeds: [embed], allowedMentions }).catch(() => {});
      }
    }
  }

  // ==========================================
  // 1. 單頻道區域禁言 (Single Timeout)
  // ==========================================

  public async jailSingleChannel(
    guild: Guild,
    channel: GuildTextBasedChannel,
    executor: GuildMember,
    target: GuildMember,
    minutes: number,
    warned: string,
    reason: string
  ): Promise<ITimeoutPrisoner> {
    const targetChan = this.getTargetChannel(channel);

    const canManage = await this.isSingleAdmin(guild, targetChan.id, executor);
    if (!canManage) {
      throw new AppError('❌ 您在該頻道沒有禁言權限！', 403);
    }

    const targetIsAdmin = await this.isSingleAdmin(guild, targetChan.id, target);
    if (targetIsAdmin) {
      throw new AppError('❌ 您無法對全域管理員或該頻道的單頻道管理員執行禁言！', 400);
    }

    const setting = await timeoutRepository.getSetting(guild.id);
    const maxLimit = setting ? setting.single_limit_minutes : config.timeout.defaultSingleLimitMinutes;
    if (minutes <= 0 || minutes > maxLimit) {
      throw new AppError(`❌ 單頻道禁言時間必須介於 1 至 ${maxLimit} 分鐘之間！`, 400);
    }

    const lockKey = RedisKeys.Lock.timeoutJail(guild.id, targetChan.id, target.id);
    return await lockService.runWithLock({ lockKey, ttlMs: 15000 }, async () => {
      const existing = await timeoutRepository.findPrisoner(guild.id, targetChan.id, target.id);
      if (existing) {
        throw new AppError('❌ 該成員目前已在該頻道處於禁言狀態！', 400);
      }

      const releaseDate = new Date(Date.now() + minutes * 60 * 1000);

      // 修改 Discord 頻道權限覆蓋
      if ('permissionOverwrites' in targetChan && targetChan.permissionOverwrites) {
        await (targetChan as TextChannel).permissionOverwrites.edit(target.id, {
          SendMessages: false,
          AddReactions: false,
          AttachFiles: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          SendMessagesInThreads: false,
        });
      }

      const prisoner = await timeoutRepository.addPrisoner({
        guild_id: guild.id,
        channel_id: targetChan.id,
        user_id: target.id,
        release_at: releaseDate.toISOString(),
        reason,
        warned,
      });

      // 註冊 DynamicTimerManager 動態記憶體定時器 (秒級精準解禁)
      const timerKey = `timeout:single:${guild.id}:${targetChan.id}:${target.id}`;
      DynamicTimerManager.schedule(timerKey, releaseDate, async () => {
        await this.autoReleaseSinglePrisoner(guild.id, targetChan.id, target.id);
      });

      // 留檔記錄
      const embed = new EmbedBuilder()
        .setTitle('【禁言紀錄】單頻道受限禁言生效')
        .setColor(0xffa500)
        .addFields(
          { name: '目標成員', value: `<@${target.id}>`, inline: true },
          { name: '執行管理者', value: `<@${executor.id}>`, inline: true },
          { name: '頻道', value: `<#${targetChan.id}>`, inline: true },
          { name: '禁言時長', value: `${minutes} 分鐘`, inline: true },
          { name: '解禁時間', value: `<t:${Math.floor(releaseDate.getTime() / 1000)}:R>`, inline: true },
          { name: '原因', value: reason, inline: false }
        )
        .setTimestamp();

      await this.sendLogChannel(guild, embed);

      return prisoner;
    });
  }

  public async releaseSingleChannel(
    guild: Guild,
    channel: GuildTextBasedChannel,
    executor: GuildMember,
    target: GuildMember
  ): Promise<boolean> {
    const targetChan = this.getTargetChannel(channel);

    const canManage = await this.isSingleAdmin(guild, targetChan.id, executor);
    if (!canManage) {
      throw new AppError('您在該頻道沒有解除禁言的權限！', 403);
    }

    const lockKey = RedisKeys.Lock.timeoutRelease(guild.id, targetChan.id, target.id);
    return await lockService.runWithLock({ lockKey, ttlMs: 15000 }, async () => {
      const existing = await timeoutRepository.findPrisoner(guild.id, targetChan.id, target.id);
      if (!existing) {
        throw new AppError('該成員在該頻道未處於禁言狀態！', 400);
      }

      // 移除 Discord 頻道權限覆蓋
      if ('permissionOverwrites' in targetChan && targetChan.permissionOverwrites) {
        await (targetChan as TextChannel).permissionOverwrites.delete(target.id).catch(() => {});
      }

      await timeoutRepository.removePrisoner(guild.id, targetChan.id, target.id);

      // 取消 DynamicTimerManager 排程
      const timerKey = `timeout:single:${guild.id}:${targetChan.id}:${target.id}`;
      DynamicTimerManager.cancel(timerKey);

      // 留檔記錄
      const embed = new EmbedBuilder()
        .setTitle('【釋放紀錄】單頻道禁言手動解除')
        .setColor(0x00ff00)
        .addFields(
          { name: '目標成員', value: `<@${target.id}>`, inline: true },
          { name: '執行管理者', value: `<@${executor.id}>`, inline: true },
          { name: '頻道', value: `<#${targetChan.id}>`, inline: true }
        )
        .setTimestamp();

      await this.sendLogChannel(guild, embed, target.id);
      return true;
    });
  }

  private async autoReleaseSinglePrisoner(guildId: string, channelId: string, userId: string): Promise<void> {
    const existing = await timeoutRepository.findPrisoner(guildId, channelId, userId);
    if (!existing) return;

    try {
      const client = (global as any).botClient as Client;
      if (client) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const channel = await guild.channels.fetch(channelId).catch(() => null);
          if (channel && 'permissionOverwrites' in channel) {
            await (channel as TextChannel).permissionOverwrites.delete(userId).catch(() => {});
          }

          const embed = new EmbedBuilder()
            .setTitle('【釋放紀錄】單頻道禁言時間到期自動解禁')
            .setColor(0x00ff00)
            .addFields(
              { name: '目標成員', value: `<@${userId}>`, inline: true },
              { name: '頻道', value: `<#${channelId}>`, inline: true }
            )
            .setTimestamp();

          await this.sendLogChannel(guild, embed, userId);
        }
      }
    } catch (err) {
      console.error(`[TimeoutService] 自動解禁單頻道失敗 (User: ${userId}):`, err);
    } finally {
      await timeoutRepository.removePrisoner(guildId, channelId, userId);
    }
  }

  // ==========================================
  // 2. 全服監獄與隔離 (Global Timeout / Jail)
  // ==========================================

  public async jailGlobal(
    guild: Guild,
    executor: GuildMember,
    target: GuildMember,
    minutes: number,
    confinementType: 'prisoner' | 'special',
    warned: string,
    reason: string
  ): Promise<ITimeoutGlobalJail> {
    const isGlobal = await this.isGlobalAdmin(guild, executor);
    if (!isGlobal) {
      throw new AppError('只有全域管理可發動全服丟監獄/隔離！', 403);
    }

    const targetIsGlobalAdmin = await this.isGlobalAdmin(guild, target);
    if (targetIsGlobalAdmin) {
      throw new AppError('您無法對全域管理員執行全服關押！', 400);
    }

    const setting = await timeoutRepository.getSetting(guild.id);
    const maxLimit = setting ? setting.global_limit_minutes : config.timeout.defaultGlobalLimitMinutes;
    if (minutes <= 0 || minutes > maxLimit) {
      throw new AppError(`全服監獄關押時間必須介於 1 至 ${maxLimit} 分鐘之間！`, 400);
    }

    const lockKey = RedisKeys.Lock.timeoutGlobalJail(guild.id, target.id);
    return await lockService.runWithLock({ lockKey, ttlMs: 15000 }, async () => {
      const existing = await timeoutRepository.findGlobalJail(guild.id, target.id);
      if (existing) {
        throw new AppError('該成員目前已處於全服監獄/隔離狀態！', 400);
      }

      // 備份目標成員的主要權限身分組 (voter, official, temporary)
      const majorRoleIds = [config.roles.voter, config.roles.official, config.roles.temporary].filter(Boolean);

      const targetCurrentRoleIds = target.roles.cache.map((r) => r.id);
      const originalRolesToBackup = targetCurrentRoleIds.filter((id) => majorRoleIds.includes(id));

      // 移除主要身分組
      if (originalRolesToBackup.length > 0) {
        await target.roles.remove(originalRolesToBackup).catch((err) => {
          console.error(`[TimeoutService] Failed to remove major roles from ${target.id}:`, err);
        });
      }

      // 賦予隔離身分組 (prisoner 或 special)
      const targetRoleId = confinementType === 'special' ? config.roles.special : config.roles.prisoner;

      if (targetRoleId) {
        await target.roles.add(targetRoleId).catch((err) => {
          console.error(`[TimeoutService] Failed to add jail role to ${target.id}:`, err);
        });
      }

      const releaseDate = new Date(Date.now() + minutes * 60 * 1000);

      const globalJailRecord = await timeoutRepository.addGlobalJail({
        guild_id: guild.id,
        user_id: target.id,
        confinement_type: confinementType,
        original_roles: originalRolesToBackup,
        release_at: releaseDate.toISOString(),
        reason,
        warned,
      });

      // 註冊 DynamicTimerManager 定時秒級釋放
      const timerKey = `timeout:global:${guild.id}:${target.id}`;
      DynamicTimerManager.schedule(timerKey, releaseDate, async () => {
        await this.autoReleaseGlobalJail(guild.id, target.id);
      });

      // 留檔記錄
      const typeLabel = confinementType === 'special' ? '特殊隔離' : '關押';
      const embed = new EmbedBuilder()
        .setTitle(`【監獄紀錄】全服${typeLabel}生效`)
        .setColor(0xe74c3c)
        .addFields(
          { name: '目標成員', value: `<@${target.id}>`, inline: true },
          { name: '執行管理者', value: `<@${executor.id}>`, inline: true },
          { name: '類型', value: typeLabel, inline: true },
          { name: '關押時長', value: `${minutes} 分鐘`, inline: true },
          { name: '出獄時間', value: `<t:${Math.floor(releaseDate.getTime() / 1000)}:R>`, inline: true },
          { name: '原因', value: reason, inline: false }
        )
        .setTimestamp();

      await this.sendLogChannel(guild, embed);
      return globalJailRecord;
    });
  }

  public async releaseGlobal(guild: Guild, executor: GuildMember, target: GuildMember): Promise<boolean> {
    const isGlobal = await this.isGlobalAdmin(guild, executor);
    if (!isGlobal) {
      throw new AppError('只有全域管理員可執行全服釋放出獄！', 403);
    }

    const lockKey = RedisKeys.Lock.timeoutGlobalRelease(guild.id, target.id);
    return await lockService.runWithLock({ lockKey, ttlMs: 15000 }, async () => {
      const existing = await timeoutRepository.findGlobalJail(guild.id, target.id);
      if (!existing) {
        throw new AppError('該成員未處於全服監獄/隔離狀態或當初不是使用指令關押！', 400);
      }

      // 移除囚犯/特殊身分組
      const targetRoleId = existing.confinement_type === 'special' ? config.roles.special : config.roles.prisoner;

      if (targetRoleId) {
        await target.roles.remove(targetRoleId).catch(() => {});
      }

      // 還原備份的原身分組
      if (existing.original_roles && existing.original_roles.length > 0) {
        await target.roles.add(existing.original_roles).catch((err) => {
          console.error(`[TimeoutService] Failed to restore original roles for ${target.id}:`, err);
        });
      }

      await timeoutRepository.removeGlobalJail(guild.id, target.id);

      // 取消動態排程
      const timerKey = `timeout:global:${guild.id}:${target.id}`;
      DynamicTimerManager.cancel(timerKey);

      // 留檔記錄
      const embed = new EmbedBuilder()
        .setTitle('【釋放紀錄】手動釋放出獄')
        .setColor(0x00ff00)
        .addFields(
          { name: '目標成員', value: `<@${target.id}>`, inline: true },
          { name: '執行管理者', value: `<@${executor.id}>`, inline: true }
        )
        .setTimestamp();

      await this.sendLogChannel(guild, embed, target.id);
      return true;
    });
  }

  private async autoReleaseGlobalJail(guildId: string, userId: string): Promise<void> {
    const existing = await timeoutRepository.findGlobalJail(guildId, userId);
    if (!existing) return;

    try {
      const client = (global as any).botClient as Client;
      if (client) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            const targetRoleId = existing.confinement_type === 'special' ? config.roles.special : config.roles.prisoner;

            if (targetRoleId) {
              await member.roles.remove(targetRoleId).catch(() => {});
            }

            if (existing.original_roles && existing.original_roles.length > 0) {
              await member.roles.add(existing.original_roles).catch(() => {});
            }
          }

          const embed = new EmbedBuilder()
            .setTitle('【釋放紀錄】到期自動出獄')
            .setColor(0x00ff00)
            .addFields({ name: '目標成員', value: `<@${userId}>`, inline: true })
            .setTimestamp();

          await this.sendLogChannel(guild, embed, userId);
        }
      }
    } catch (err) {
      console.error(`[TimeoutService] 自動解禁全服監獄失敗 (User: ${userId}):`, err);
    } finally {
      await timeoutRepository.removeGlobalJail(guildId, userId);
    }
  }

  // ==========================================
  // 3. 背景排程掃描與重啟恢復
  // ==========================================

  public async scanAndReleaseExpired(client: Client): Promise<number> {
    (global as any).botClient = client;
    const lockKey = RedisKeys.Lock.timeoutScan();
    return await lockService.runWithLock({ lockKey, ttlMs: 30000 }, async () => {
      let releasedCount = 0;

      // 1. 掃描單頻道禁言到期
      const expiredSingle = await timeoutRepository.getExpiredPrisoners();
      for (const item of expiredSingle) {
        await this.autoReleaseSinglePrisoner(item.guild_id, item.channel_id, item.user_id);
        releasedCount++;
      }

      // 2. 掃描監獄到期
      const expiredGlobal = await timeoutRepository.getExpiredGlobalJails();
      for (const item of expiredGlobal) {
        await this.autoReleaseGlobalJail(item.guild_id, item.user_id);
        releasedCount++;
      }

      return releasedCount;
    });
  }

  // ==========================================
  // 4. 設定與列表查詢 (Setting API)
  // ==========================================

  public async addGlobalAdminRole(guild: Guild, roleId: string) {
    return await timeoutRepository.addGlobalAdminRole(guild.id, roleId);
  }

  public async removeGlobalAdminRole(guild: Guild, roleId: string) {
    return await timeoutRepository.removeGlobalAdminRole(guild.id, roleId);
  }

  public async addSingleAdminRole(guild: Guild, channelId: string, roleId: string) {
    return await timeoutRepository.addSingleAdminRole(guild.id, channelId, roleId);
  }

  public async removeSingleAdminRole(guild: Guild, channelId: string, roleId: string) {
    return await timeoutRepository.removeSingleAdminRole(guild.id, channelId, roleId);
  }

  public async updateSettingLimit(guild: Guild, scope: 'single' | 'global', minutes: number) {
    if (minutes <= 0 || minutes > 43200) {
      throw new AppError('❌ 禁言時間上限必須介於 1 到 43200 分鐘 (30天) 之間！', 400);
    }
    const updateData = scope === 'single' ? { single_limit_minutes: minutes } : { global_limit_minutes: minutes };

    return await timeoutRepository.upsertSetting(guild.id, updateData);
  }

  public async getPrisonersList(guildId: string, channelId?: string) {
    return await timeoutRepository.getPrisoners(guildId, channelId);
  }

  public async getGlobalJailList(guildId: string) {
    return await timeoutRepository.getGlobalJails(guildId);
  }

  public async getConfigSummary(guildId: string, channelId: string) {
    const adminRoles = await timeoutRepository.getGlobalAdminRoles(guildId);
    const singleRoles = await timeoutRepository.getSingleAdminRoles(guildId, channelId);
    const setting = await timeoutRepository.getSetting(guildId);
    return {
      adminRoleIds: adminRoles.map((r) => r.role_id),
      singleRoleIds: singleRoles.map((r) => r.role_id),
      singleLimitMinutes: setting ? setting.single_limit_minutes : config.timeout.defaultSingleLimitMinutes,
      globalLimitMinutes: setting ? setting.global_limit_minutes : config.timeout.defaultGlobalLimitMinutes,
    };
  }

  public async getConfigSummaryEmbed(guild: Guild, channelId: string): Promise<EmbedBuilder> {
    const summary = await this.getConfigSummary(guild.id, channelId);
    const adminRolesText =
      summary.adminRoleIds.length > 0 ? summary.adminRoleIds.map((id: string) => `<@&${id}>`).join(', ') : '未設定';
    const singleRolesText =
      summary.singleRoleIds.length > 0 ? summary.singleRoleIds.map((id: string) => `<@&${id}>`).join(', ') : '未設定';

    return new EmbedBuilder()
      .setTitle('頻道禁言與監獄系統設定概覽')
      .setColor(0x3498db)
      .addFields(
        { name: '全域管理身分組 (Global Admin)', value: adminRolesText, inline: false },
        { name: `當前頻道 (<#${channelId}>) 管理身分組`, value: singleRolesText, inline: false },
        { name: '單頻道禁言最高上限', value: `${summary.singleLimitMinutes} 分鐘`, inline: true },
        { name: '全服監獄關押最高上限', value: `${summary.globalLimitMinutes} 分鐘`, inline: true }
      );
  }

  public async getSinglePrisonerListEmbed(guild: Guild, channelId: string): Promise<EmbedBuilder | string> {
    const prisoners = await this.getPrisonersList(guild.id, channelId);
    if (prisoners.length === 0) {
      return `頻道 <#${channelId}> 目前沒有被禁言的成員。`;
    }

    const listText = prisoners
      .map((p) => {
        const unix = Math.floor(new Date(p.release_at).getTime() / 1000);
        return `• <@${p.user_id}> | 解禁時間: <t:${unix}:R> (${p.reason || '無原因'})`;
      })
      .join('\n');

    return new EmbedBuilder().setTitle(`頻道 <#${channelId}> 禁言成員名單`).setColor(0xe74c3c).setDescription(listText);
  }

  public async getGlobalJailListEmbed(guild: Guild): Promise<EmbedBuilder | string> {
    const jails = await this.getGlobalJailList(guild.id);
    if (jails.length === 0) {
      return '目前沒有被關押或隔離的成員。';
    }

    const listText = jails
      .map((j) => {
        const unix = Math.floor(new Date(j.release_at).getTime() / 1000);
        const label = j.confinement_type === 'special' ? '[特殊隔離]' : '[關押]';
        return `• <@${j.user_id}> ${label} | 出獄時間: <t:${unix}:R> (${j.reason || '無原因'})`;
      })
      .join('\n');

    return new EmbedBuilder().setTitle('全服監獄 / 隔離成員名單').setColor(0xe74c3c).setDescription(listText);
  }
}

export default new TimeoutService();
