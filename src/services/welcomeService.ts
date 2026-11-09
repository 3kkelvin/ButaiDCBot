import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GuildMember,
  TextChannel,
} from 'discord.js';
import { welcomeRepository } from '../repositories/welcomeRepository';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import { AppError } from '../utils/appError';
import { BaseResponse } from '../utils/baseResponse';

/**
 * 3 天過期自刪毫秒數 (3 * 24 * 60 * 60 * 1000)
 */
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 新成員歡迎業務服務 (BLL)
 */
export class WelcomeService {
  /**
   * 設定伺服器的自動歡迎頻道與歡迎詞
   *
   * @param guildId 伺服器 ID
   * @param channelId 文字頻道 ID
   * @param context 歡迎內文
   * @returns 成功配置之 Embed 回應卡片
   */
  public async setupWelcome(guildId: string, channelId: string, context: string): Promise<EmbedBuilder> {
    await welcomeRepository.saveConfig({
      guildId,
      channelId,
      context,
      updatedAt: new Date().toISOString(),
    });

    return new EmbedBuilder()
      .setTitle('歡迎系統配置完成')
      .setColor(0x57f287)
      .setDescription('已成功配置新成員歡迎訊息與互動打招呼按鈕！')
      .addFields(
        { name: '發送頻道', value: `<#${channelId}>`, inline: true },
        { name: '歡迎內文', value: context, inline: false },
        { name: '訊息有效期限', value: '3 天 (期滿自動刪除)', inline: true }
      )
      .setTimestamp();
  }

  /**
   * 處理新成員加入伺服器事件 (Events.GuildMemberAdd)
   *
   * @param member 加入伺服器的成員物件
   */
  public async handleNewMember(member: GuildMember): Promise<void> {
    const config = await welcomeRepository.getConfig(member.guild.id);
    if (!config) return;

    const channel =
      member.guild.channels.cache.get(config.channelId) ||
      (await member.guild.channels.fetch(config.channelId).catch(() => null));

    if (!channel || !(channel instanceof TextChannel)) {
      console.warn(`[WelcomeService] 找不到或無效的歡迎目標頻道 ID: ${config.channelId}`);
      return;
    }

    // 1. 組裝歡迎 Embed (包含頭像與暱稱資訊)
    const avatarUrl = member.user.displayAvatarURL({ size: 256 });
    const welcomeEmbed = new EmbedBuilder()
      .setAuthor({ name: member.displayName, iconURL: avatarUrl })
      .setThumbnail(avatarUrl)
      .setTitle('歡迎新成員加入！')
      .setDescription(config.context)
      .setColor(0x57f287)
      .setFooter({ text: '點擊下方按鈕向新成員打招呼 (此訊息 3 天後將自動清理)' })
      .setTimestamp();

    // 2. 組裝他人可點擊之打招呼按鈕
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`welcome_greet_${member.id}`).setLabel('打個招呼').setStyle(ButtonStyle.Primary)
    );

    // 3. 發送訊息 (內容直接 @ 被 ping 的新成員用戶)
    const sentMessage = await channel.send({
      content: `<@${member.id}>`,
      embeds: [welcomeEmbed],
      components: [actionRow],
    });

    // 4. 加入 Redis 排程，3 天後自動刪除該訊息
    const deleteAtMs = Date.now() + THREE_DAYS_MS;
    await welcomeRepository.addPendingDeletion(channel.id, sentMessage.id, deleteAtMs);
  }

  /**
   * 處理他人點擊「打個招呼」按鈕的互動
   *
   * @param interaction 按鈕點擊交互
   */
  public async handleGreetButton(interaction: ButtonInteraction): Promise<void> {
    const targetMemberId = interaction.customId.replace('welcome_greet_', '');
    if (!targetMemberId) {
      throw new AppError('無效的歡迎互動目標！', 400);
    }

    // 取得點擊者名稱
    const clickerMember = interaction.member instanceof GuildMember ? interaction.member : null;
    const clickerName = clickerMember ? clickerMember.displayName : interaction.user.username;

    // 招呼語句候選 (遵循無 Emoji 規範)
    const greetings = [
      `${clickerName} 歡迎你的到來 <@${targetMemberId}>！`,
      `${clickerName} 在對你打招呼 <@${targetMemberId}>`,
      `${clickerName} 在對你說你好 <@${targetMemberId}>`,
    ];
    const greetingText = greetings[Math.floor(Math.random() * greetings.length)];

    // 防連點互斥鎖
    const lockKey = RedisKeys.Lock.welcomeGreet(interaction.user.id);
    await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 3000,
        releaseOnSuccess: true,
      },
      async () => {
        // 讓機器人於頻道內發布打招呼文字訊息
        if (interaction.channel && 'send' in interaction.channel) {
          await interaction.channel.send({
            content: greetingText,
            allowedMentions: { users: [targetMemberId] },
          });
        }

        // 以隱密訊息回應點擊者 (使用 BaseResponse 統一處置)
        await BaseResponse.send(interaction, '已為您送出打招呼！', true);
      }
    );
  }

  /**
   * 定時清理超過 3 天的過期歡迎訊息 (由 scheduler 排程驅動)
   *
   * @param client Discord 客戶端實例
   */
  public async cleanupExpiredMessages(client: Client): Promise<void> {
    const dueItems = await welcomeRepository.getDueDeletions(Date.now());
    if (dueItems.length === 0) return;

    console.log(`[WelcomeService] 偵測到 ${dueItems.length} 則待刪除的 3 天到期歡迎訊息...`);

    for (const item of dueItems) {
      try {
        const channel =
          client.channels.cache.get(item.channelId) || (await client.channels.fetch(item.channelId).catch(() => null));
        if (channel && channel instanceof TextChannel) {
          const msg = await channel.messages.fetch(item.messageId).catch(() => null);
          if (msg) {
            await msg.delete().catch(() => {});
          }
        }
      } catch (err: any) {
        console.error(`[WelcomeService] 刪除過期歡迎訊息失敗 (${item.messageId}):`, err.message);
      } finally {
        // 從排程中移除已處理的記錄
        await welcomeRepository.removePendingDeletion(item.raw);
      }
    }
  }
}

export const welcomeService = new WelcomeService();
