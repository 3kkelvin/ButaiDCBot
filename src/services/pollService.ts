import { InteractionReplyOptions } from 'discord.js';

/**
 * 投票業務邏輯層 (BLL Service)
 * 職責：承載投票主題、選項文案與 48 小時時限設定，並負責組裝 Discord 原生 Poll 之 InteractionReplyOptions Payload
 */
export class PollService {
  /**
   * 預設投票問題題目
   */
  private readonly QUESTION = '您對此持何意見？What is your position?';

  /**
   * 預設投票選項 (支持、反對、棄權)
   */
  private readonly ANSWERS = [{ text: '支持 In Favor' }, { text: '反對 Opposed' }, { text: '棄權 Abstain' }];

  /**
   * 預設投票時限 (48 小時)
   */
  private readonly DURATION_HOURS = 48;

  /**
   * 建立 Discord 原生投票之 InteractionReplyOptions Payload
   *
   * @returns 包含 question, answers, duration 與 allowMultiselect 設定之原生 Poll 物件
   */
  public createPollPayload(): InteractionReplyOptions {
    return {
      poll: {
        question: { text: this.QUESTION },
        answers: this.ANSWERS,
        duration: this.DURATION_HOURS,
        allowMultiselect: false,
      },
    };
  }
}

/** 投票服務單例 */
export const pollService = new PollService();
