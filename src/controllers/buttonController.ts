import { Client, Events } from 'discord.js';
import { discordEventHandler } from '../utils/discordEventHandler';
import { helpService } from '../services/helpService';
import { HELP_BUTTON_PREFIX } from '../models/help/helpDTO';

/**
 * 監聽並處置 Discord 按鈕互動事件 (Events.InteractionCreate)
 * 負責將按鈕點擊路由分發給對應的服務層或分流函式
 */
export const setupButtonController = (client: Client) => {
  client.on(
    Events.InteractionCreate,
    discordEventHandler('ButtonInteraction', async (interaction) => {
      // 僅攔截按鈕互動
      if (!interaction.isButton()) return;

      const customId = interaction.customId;
      const [prefix] = customId.split(':');

      // 依據 CustomId Prefix 進行分流處置
      switch (prefix) {
        case HELP_BUTTON_PREFIX:
          await helpService.handleButtonInteraction(interaction);
          break;

        default:
          // 預留未來其他常駐按鈕（如身分組按鈕、處分按鈕等）擴充分流點
          break;
      }
    })
  );
};
