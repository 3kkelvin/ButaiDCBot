import { ButtonInteraction, Client, Events } from 'discord.js';
import { commandsMap } from '../utils/commands';
import { DiscordLogger } from '../utils/discordLogger';
import { discordEventHandler } from '../utils/discordEventHandler';
import { forumPollService } from '../services/forumPollService';
import { welcomeService } from '../services/welcomeService';
import { ticketService } from '../services/ticketService';

/**
 * 分發按鈕交互請求至對應的業務服務層
 */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  // 1. 論壇通知永不打擾按鈕
  if (customId === 'forum_poll_optout') {
    await forumPollService.handleOptOutButton(interaction);
    return;
  }

  // 2. 歡迎新成員打招呼按鈕
  if (customId.startsWith('welcome_greet_')) {
    await welcomeService.handleGreetButton(interaction);
    return;
  }

  // 3. 申請工單按鈕
  if (customId.startsWith('ticket_apply_')) {
    await ticketService.handleApplyButton(interaction);
    return;
  }

  // 4. 關閉工單按鈕
  if (customId.startsWith('ticket_close_')) {
    await ticketService.handleCloseButton(interaction);
    return;
  }

  console.warn(`[InteractionController] 未知的按鈕交互 ID: ${customId}`);
}

/**
 * 監聽並處置 Discord 互動指令事件 (Events.InteractionCreate)
 * 負責將 Slash 指令與按鈕組件分發給對應的指令與業務模組
 */
export const setupInteractionController = (client: Client) => {
  client.on(
    Events.InteractionCreate,
    discordEventHandler('InteractionCreate', async (interaction) => {
      // 處理 Autocomplete 事件
      if (interaction.isAutocomplete()) {
        const command = commandsMap.get(interaction.commandName);
        if (command && typeof command.autocomplete === 'function') {
          await command.autocomplete(interaction);
        }
        return;
      }

      // 1. 處理按鈕組件交互
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
        return;
      }

      // 2. 處理斜線指令
      if (!interaction.isChatInputCommand()) return;

      const command = commandsMap.get(interaction.commandName);
      if (!command) {
        console.error(`[InteractionController] 找不到對應的指令處理器: ${interaction.commandName}`);
        return;
      }

      // 3. 指令審計普通 Log (支援 skipAuditLog 特性過濾)
      if (!command.skipAuditLog) {
        let fullCommandName = interaction.commandName;
        try {
          const subcommand = interaction.options.getSubcommand(false);
          if (subcommand) {
            fullCommandName = `${interaction.commandName} ${subcommand}`;
          }
        } catch (e) {
          // 忽略無子指令的解析例外
        }

        DiscordLogger.sendInfoLog({
          title: '📝指令使用紀錄',
          message: `👤 **${interaction.user.tag}** 使用了指令`,
          commandName: fullCommandName,
          userId: interaction.user.id,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'local',
        }).catch((logErr) => {
          console.error('[InteractionController] 發送指令審計日誌失敗：', logErr.message);
        });
      }

      // 4. 執行指令邏輯，錯誤將由 discordEventHandler 外層全自動捕獲並報警/回覆
      await command.execute(interaction);
    })
  );
};
