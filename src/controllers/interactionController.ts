import { Client, Events } from 'discord.js';
import { commandsMap } from '../utils/commands';
import { DiscordLogger } from '../utils/discordLogger';
import { discordEventHandler } from '../utils/discordEventHandler';

/**
 * 監聽並處置 Discord 互動指令事件 (Events.InteractionCreate)
 * 負責將 Slash 指令路由分發給對應的指令子模組
 */
export const setupInteractionController = (client: Client) => {
  client.on(
    Events.InteractionCreate,
    discordEventHandler('InteractionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = commandsMap.get(interaction.commandName);
      if (!command) {
        console.error(`[InteractionController] 找不到對應的指令處理器: ${interaction.commandName}`);
        return;
      }

      // 1. 指令審計普通 Log (支援 skipAuditLog 特性過濾)
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

      // 2. 執行指令邏輯，錯誤將由 discordEventHandler 外層全自動捕獲並報警/回覆
      await command.execute(interaction);
    })
  );
};
