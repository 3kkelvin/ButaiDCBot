import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';

/**
 * Help 指令預設前綴識別字串
 */
export const HELP_BUTTON_PREFIX = 'help';

/**
 * 單一指令條目介面
 * 代表一個 Slash 指令或 Subcommand 的說明條目
 */
export interface IHelpItem {
  /**
   * 指令全名（包含子指令路徑，如 `/role query` 或 `/ping`）
   */
  fullName: string;

  /**
   * 指令說明描述
   */
  description: string;

  /**
   * 指令層級或子指令層級的自訂註解標籤
   */
  annotations: string[];

  /**
   * 是否跳過指令 Webhook 審計日誌
   */
  skipAuditLog: boolean;
}

/**
 * 指令大類 (Category) 結構介面
 * 代表一個頂層指令族（如 `role`, `timeout`, `ping` 等）
 */
export interface IHelpCategory {
  /**
   * 大類指令名稱（頂層 Slash 指令名稱，如 `role`）
   */
  name: string;

  /**
   * 大類指令描述
   */
  description: string;

  /**
   * 主指令的自訂註解標籤
   */
  annotations: string[];

  /**
   * 該大類下收錄的所有子指令條目清單
   */
  items: IHelpItem[];
}

/**
 * 幫助頁面生成結果 DTO
 * 封裝呼叫 HelpService 後準備回應給 Discord 的 Embed 與 ActionRow 按鈕
 */
export interface IHelpPageResult {
  /**
   * 組裝完成的 Discord Embed 說明頁面
   */
  embed: EmbedBuilder;

  /**
   * 包含分頁按鈕或大類按鈕的 ActionRow 元件陣列
   */
  components: ActionRowBuilder<ButtonBuilder>[];

  /**
   * 當前頁碼 (1-indexed)
   */
  currentPage: number;

  /**
   * 總頁數
   */
  totalPages: number;
}

/**
 * Help 按鈕 CustomId 拆解結構介面
 * CustomId 格式: `help:action:category:page:userId`
 * 例如: `help:page:role:2:123456789`
 */
export interface IHelpButtonParams {
  /**
   * 前綴識別符，恆為 `help`
   */
  prefix: string;

  /**
   * 按鈕動作類型：`cat` (切換大類) 或 `page` (翻頁)
   */
  action: 'cat' | 'page';

  /**
   * 目標大類名稱 (`all` 代表頂層總覽，或具體大類名如 `role`)
   */
  category: string;

  /**
   * 目標頁碼 (1-indexed)
   */
  targetPage: number;

  /**
   * 觸發指令之原始使用者 ID（用於驗證僅允許本人操作按鈕）
   */
  userId: string;
}
