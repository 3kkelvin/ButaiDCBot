import {
  ActionRowBuilder,
  AnyThreadChannel,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ForumChannel,
} from 'discord.js';
import { forumPollRepository } from '../repositories/forumPollRepository';
import { discordRepository } from '../repositories/discordRepository';
import { pollService } from './pollService';
import lockService from './lockService';
import { RedisKeys } from '../utils/redisKeys';
import { AppError } from '../utils/appError';
import { IForumPollSetupDTO } from '../models/forum/forumPollDTO';

/**
 * 論壇發帖自動投票與私信通知業務服務 (BLL)
 */
export class ForumPollService {
  /**
   * 設定論壇頻道的自動發起投票與通知
   *
   * @param dto 配置參數 (包含 guildId, forumChannel, roleId, ping)
   * @param forumChannel 論壇頻道實例
   * @returns 成功配置之 Embed 回應卡片
   */
  public async setupForumPoll(dto: IForumPollSetupDTO, forumChannel: ForumChannel): Promise<EmbedBuilder> {
    if (forumChannel.type !== ChannelType.GuildForum) {
      throw new AppError('指定頻道必須為論壇頻道 (GuildForum)！', 400);
    }

    await forumPollRepository.saveConfig({
      guildId: dto.guildId,
      forumId: dto.forumId,
      roleId: dto.roleId,
      ping: dto.ping,
      updatedAt: new Date().toISOString(),
    });

    return new EmbedBuilder()
      .setTitle('論壇發帖自動投票與通知配置完成')
      .setColor(0x00ffcc)
      .setDescription('已成功綁定目標論壇頻道，當有新帖子建立時將自動發起投票並通知該身分組。')
      .addFields(
        { name: '論壇頻道', value: `<#${forumChannel.id}>`, inline: true },
        { name: '通知身分組', value: `<@&${dto.roleId}>`, inline: true },
        { name: '免打擾切換按鈕 (ping)', value: dto.ping ? '啟用 (可永不打擾)' : '停用 (固定發送)', inline: true }
      )
      .setTimestamp();
  }

  /**
   * 處置新建立的論壇貼文討論串 (Events.ThreadCreate)
   * 1. 於帖子內自動發起投票 (與 /poll 內容和時限一致)
   * 2. 依據設定私訊通知指定身分組所有成員
   *
   * @param thread 新建立的討論串實例
   */
  public async handleNewForumThread(thread: AnyThreadChannel): Promise<void> {
    const parentId = thread.parentId;
    if (!parentId) return;

    // 1. 讀取論壇配置，未配置則跳過
    const config = await forumPollRepository.getConfig(parentId);
    if (!config) return;

    // 2. 使用分散式鎖防止重複處理同一貼文
    const lockKey = RedisKeys.Lock.forumPollThread(thread.id);

    await lockService.runWithLock(
      {
        lockKey,
        ttlMs: 60000,
        releaseOnSuccess: true,
      },
      async () => {
        // 3. 在新帖子內發起投票 (內容與時限與 /poll 保持一致：48小時、三選項)
        const pollPayload = pollService.createPollPayload();
        if (pollPayload.poll) {
          try {
            await thread.send({
              poll: pollPayload.poll,
            });
            console.log(`[ForumPollService] 成功於貼文 "${thread.name}" 發起自動投票`);
          } catch (pollErr: any) {
            console.error(`[ForumPollService] 貼文自動投票發起失敗:`, pollErr.message);
          }
        }

        // 4. 透過 DAL 層取得伺服器成員名單 (依循防線規範使用 discordRepository.getGuildMembers)
        const guild = thread.guild;
        const membersCollection = await discordRepository.getGuildMembers(guild);

        // 過濾出擁有該身分組的非機器人成員
        const members = Array.from(membersCollection.values()).filter((m) => !m.user.bot && m.roles.cache.has(config.roleId));

        if (members.length === 0) return;

        // 5. 預先組裝私信 Embed 與組件 (在迴圈外宣告一次，避免記憶體浪費與 GC 壓力)
        const dmEmbed = new EmbedBuilder()
          .setTitle('論壇新貼文通知')
          .setDescription(`请跳转至[${thread.name}](${thread.url})！`)
          .setColor(0x00ffcc)
          .setTimestamp();

        const components: ActionRowBuilder<ButtonBuilder>[] = [];
        if (config.ping) {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('forum_poll_optout')
              .setLabel('決定關閉通知 (永不打擾)')
              .setStyle(ButtonStyle.Secondary)
          );
          components.push(row);
        }

        // 6. 併發預先拉取 Opt-out 名單 (避免迴圈內 N+1 串行 Redis 阻塞)
        let eligibleMembers = members;
        if (config.ping) {
          const optOutStatuses = await Promise.all(
            members.map(async (m) => ({
              member: m,
              optedOut: await forumPollRepository.isOptedOut(m.id),
            }))
          );
          eligibleMembers = optOutStatuses.filter((s) => !s.optedOut).map((s) => s.member);
        }

        // 7. 逐一發送私信通知 (帶 Fail-Safe 防禦 50007 錯誤)
        for (const member of eligibleMembers) {
          try {
            await member.send({
              embeds: [dmEmbed],
              components,
            });
          } catch (dmErr: any) {
            if (dmErr.code === 50007) {
              console.warn(`[ForumPollService] 成員 ${member.user.tag} 關閉了伺服器私信接收，安全略過。`);
            } else {
              console.error(`[ForumPollService] 私信發送至 ${member.user.tag} 失敗:`, dmErr.message);
            }
          }
        }
      }
    );
  }

  /**
   * 處理私訊中點擊「永不打擾」按鈕的互動
   *
   * @param interaction 按鈕點擊交互
   */
  public async handleOptOutButton(interaction: ButtonInteraction): Promise<void> {
    await forumPollRepository.setOptOut(interaction.user.id, true);

    await interaction.update({
      content: '已為您設定永不打擾，未來論壇新貼文將不再向您發送私訊通知！',
      components: [],
    });
  }
}

export const forumPollService = new ForumPollService();
