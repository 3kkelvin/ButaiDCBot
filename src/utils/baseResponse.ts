import { 
  ChatInputCommandInteraction, 
  CommandInteraction, 
  EmbedBuilder, 
  InteractionReplyOptions, 
  MessagePayload 
} from 'discord.js';

export type ResponsePayload = string | EmbedBuilder | InteractionReplyOptions | MessagePayload;

/**
 * 表現層統一回應工具 (BaseResponse)
 * 自動辨識 Discord Interaction 的 deferred / replied 狀態，確保 1 行安全發送回應
 */
export class BaseResponse {
  /**
   * 統一安全發送回應
   * 自動切換 interaction.reply / editReply / followUp
   * 
   * @param interaction Discord 互動事件
   * @param payload 欲回覆的訊息字串、EmbedBuilder 或 Options 物件
   * @param ephemeral 是否設為隱密訊息 (僅在尚未 reply/defer 且傳入字串/Embed 時生效)
   */
  static async send(
    interaction: CommandInteraction | ChatInputCommandInteraction | any,
    payload: ResponsePayload,
    ephemeral: boolean = false
  ): Promise<any> {
    if (!interaction || typeof interaction !== 'object') {
      throw new Error('[BaseResponse] 傳入的 interaction 物件無效');
    }

    let options: InteractionReplyOptions | MessagePayload | string;

    if (typeof payload === 'string') {
      options = { content: payload, ephemeral };
    } else if (payload instanceof EmbedBuilder) {
      options = { embeds: [payload], ephemeral };
    } else {
      options = payload;
    }

    // 1. 已 defer 狀態 ➔ 呼叫 editReply
    if (interaction.deferred) {
      return await interaction.editReply(options);
    }

    // 2. 已 reply 狀態 ➔ 呼叫 followUp
    if (interaction.replied) {
      return await interaction.followUp(options);
    }

    // 3. 初始狀態 ➔ 呼叫 reply
    return await interaction.reply(options);
  }

  /**
   * 快速發送隱密訊息 (ephemeral: true)
   */
  static async sendEphemeral(
    interaction: CommandInteraction | ChatInputCommandInteraction | any,
    message: string
  ): Promise<any> {
    return await this.send(interaction, { content: message, ephemeral: true });
  }
}
