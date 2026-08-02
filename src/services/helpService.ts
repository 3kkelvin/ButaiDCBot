import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ButtonInteraction } from 'discord.js';
import { commandsList, ICommand } from '../utils/commands';
import { IHelpCategory, IHelpItem, IHelpPageResult, IHelpButtonParams, HELP_BUTTON_PREFIX } from '../models/help/helpDTO';

/**
 * 單頁最大顯示行數（條目限制）
 */
const PAGE_SIZE = 10;

/**
 * 幫助指令業務服務層 (BLL)
 * 負責自動化動態讀取指令列表、反射 Subcommand 等級與自訂註解，並組裝為 EmbedBuilder 與 Component 按鈕
 */
export class HelpService {
  /**
   * 在機器人初始化階段，動態將各指令大類塞入help指令的category選項
   * 避開模組載入階段的循環依賴問題
   */
  public injectCategoryChoices(helpCmd: ICommand): void {
    if (!helpCmd || !helpCmd.data) return;

    // 獲取choices = 拿到的各指令大類
    const categories = this.parseCategories();
    const choices = categories.map((cat) => ({
      name: `/${cat.name} - ${cat.description}`.slice(0, 100),
      value: cat.name,
    }));

    // 把前面拿到的choices塞進help指令的category選項
    const categoryOption = helpCmd.data.options?.find((opt: any) => opt.name === 'category');
    if (categoryOption && typeof categoryOption.addChoices === 'function') {
      categoryOption.addChoices(...choices);
    }
  }

  /**
   * 生成頂層指令大類總覽頁面
   * @param page 當前頁碼 (1-indexed)
   * @param userId 觸發者 User ID
   */
  public getTopLevelHelp(page: number = 1, userId: string): IHelpPageResult {
    const categories = this.parseCategories();
    const totalPages = Math.ceil(categories.length / PAGE_SIZE) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageCategories = categories.slice(startIdx, startIdx + PAGE_SIZE);

    const embed = new EmbedBuilder()
      .setColor('#00ffcc') // 霓虹綠
      .setTitle('大舞台機器人指令大類總覽')
      .setDescription('以下是目前系統中已註冊的指令大類。\n點擊下方按鈕或輸入 `/help category:<大類>` 可檢視詳細子指令。')
      .setTimestamp()
      .setFooter({
        text: `頁次: ${currentPage} / ${totalPages} | 共 ${categories.length} 個指令大類`,
      });

    for (const cat of pageCategories) {
      const annotationsStr = cat.annotations.length > 0 ? ` ${cat.annotations.map((a) => `\`${a}\``).join(' ')}` : '';
      const subItemCount = cat.items.length > 1 ? `(包含 ${cat.items.length} 個子指令)` : '';
      embed.addFields({
        name: `\`/${cat.name}\`${annotationsStr} ${subItemCount}`,
        value: cat.description || '無描述資訊',
        inline: false,
      });
    }

    const components = this.buildComponents({
      category: 'all',
      currentPage,
      totalPages,
      userId,
      categories,
    });

    return { embed, components, currentPage, totalPages };
  }

  /**
   * 生成特定指令大類的詳細條目頁面
   * @param categoryName 大類名稱 (如 `role`)
   * @param page 當前頁碼 (1-indexed)
   * @param userId 觸發者 User ID
   */
  public getCategoryHelp(categoryName: string, page: number = 1, userId: string): IHelpPageResult {
    const categories = this.parseCategories();
    const category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());

    if (!category) {
      // 若找不到大類，退回頂層總覽
      return this.getTopLevelHelp(1, userId);
    }

    const items = category.items;
    const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageItems = items.slice(startIdx, startIdx + PAGE_SIZE);

    const catAnnotations = category.annotations.length > 0 ? ` ${category.annotations.map((a) => `\`${a}\``).join(' ')}` : '';

    const embed = new EmbedBuilder()
      .setColor('#00bfff') // 深天藍
      .setTitle(`指令族說明：/${category.name}${catAnnotations}`)
      .setDescription(category.description || '無大類描述資訊')
      .setTimestamp()
      .setFooter({
        text: `頁次: ${currentPage} / ${totalPages} | 該指令大類共 ${items.length} 個條目`,
      });

    for (const item of pageItems) {
      const annotationsStr = item.annotations.length > 0 ? ` ${item.annotations.map((a) => `\`${a}\``).join(' ')}` : '';
      const auditTag = item.skipAuditLog ? ' `(不紀錄Log)`' : '';

      embed.addFields({
        name: `\`${item.fullName}\`${annotationsStr}${auditTag}`,
        value: item.description || '無描述資訊',
        inline: false,
      });
    }

    const components = this.buildComponents({
      category: category.name,
      currentPage,
      totalPages,
      userId,
      categories,
    });

    return { embed, components, currentPage, totalPages };
  }

  /**
   * 處理分頁與大類切換之按鈕互動
   * @param interaction 按鈕 Interaction
   */
  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;
    const params = this.parseCustomId(customId);

    if (!params) {
      return;
    }

    // 身分驗證：僅允許原始觸發指令的使用者操作按鈕
    if (interaction.user.id !== params.userId) {
      await interaction.reply({
        content: '❌ 這不是您的 Help 指令選單，請自行輸入 `/help` 查詢！',
        ephemeral: true,
      });
      return;
    }

    let result: IHelpPageResult;

    if (params.action === 'cat') {
      if (params.category === 'all') {
        result = this.getTopLevelHelp(1, params.userId);
      } else {
        result = this.getCategoryHelp(params.category, 1, params.userId);
      }
    } else {
      // action === 'page'
      if (params.category === 'all') {
        result = this.getTopLevelHelp(params.targetPage, params.userId);
      } else {
        result = this.getCategoryHelp(params.category, params.targetPage, params.userId);
      }
    }

    await interaction.update({
      embeds: [result.embed],
      components: result.components,
    });
  }

  /**
   * 從 commandsList 自動反射解析出所有分類與條目
   */
  public parseCategories(): IHelpCategory[] {
    const categories: IHelpCategory[] = [];

    for (const cmd of commandsList) {
      const name = cmd.data.name;
      const json = cmd.data.toJSON();
      const mainDescription = json.description || '無描述資訊';
      const mainAnnotations = cmd.annotations || [];
      const skipAuditLog = !!cmd.skipAuditLog;

      const options = json.options || [];
      const groups = options.filter((opt: any) => opt.type === 2);
      const directSubcommands = options.filter((opt: any) => opt.type === 1);

      const items: IHelpItem[] = [];

      if (groups.length > 0 || directSubcommands.length > 0) {
        // 1. 解析所有 SubcommandGroup (type === 2) 及其內部的子指令
        for (const group of groups) {
          const groupName = group.name;
          const groupSubs = group.options?.filter((sub: any) => sub.type === 1) || [];

          for (const sub of groupSubs) {
            const subName = sub.name;
            const subDesc = sub.description || '無描述資訊';
            const fullKey = `${groupName}/${subName}`;

            const subMeta = cmd.subcommandsMetadata?.[fullKey] || cmd.subcommandsMetadata?.[subName];
            const subAnnotations = subMeta?.annotations || [];

            items.push({
              fullName: `/${name} ${groupName} ${subName}`,
              description: subDesc,
              annotations: subAnnotations,
              skipAuditLog,
            });
          }
        }

        // 2. 解析所有直屬的 Subcommand (type === 1)
        for (const sub of directSubcommands) {
          const subName = sub.name;
          const subDesc = sub.description || '無描述資訊';
          const subMeta = cmd.subcommandsMetadata?.[subName];
          const subAnnotations = subMeta?.annotations || [];

          items.push({
            fullName: `/${name} ${subName}`,
            description: subDesc,
            annotations: subAnnotations,
            skipAuditLog,
          });
        }
      } else {
        // 3. 無子指令：直接列出主指令
        items.push({
          fullName: `/${name}`,
          description: mainDescription,
          annotations: mainAnnotations,
          skipAuditLog,
        });
      }

      categories.push({
        name,
        description: mainDescription,
        annotations: mainAnnotations,
        items,
      });
    }

    return categories;
  }

  /**
   * 組裝分頁按鈕與大類切換按鈕 Component
   */
  private buildComponents(opts: {
    category: string;
    currentPage: number;
    totalPages: number;
    userId: string;
    categories: IHelpCategory[];
  }): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Row 1: 分頁導覽按鈕
    const navRow = new ActionRowBuilder<ButtonBuilder>();

    const prevButton = new ButtonBuilder()
      .setCustomId(`${HELP_BUTTON_PREFIX}:page:${opts.category}:${opts.currentPage - 1}:${opts.userId}`)
      .setLabel('◀ 上一頁')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(opts.currentPage <= 1);

    const pageIndicator = new ButtonBuilder()
      .setCustomId(`${HELP_BUTTON_PREFIX}:noop:${opts.category}:${opts.currentPage}:${opts.userId}`)
      .setLabel(`第 ${opts.currentPage} / ${opts.totalPages} 頁`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const nextButton = new ButtonBuilder()
      .setCustomId(`${HELP_BUTTON_PREFIX}:page:${opts.category}:${opts.currentPage + 1}:${opts.userId}`)
      .setLabel('下一頁 ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(opts.currentPage >= opts.totalPages);

    navRow.addComponents(prevButton, pageIndicator, nextButton);
    rows.push(navRow);

    // Row 2: 大類快速切換按鈕（最多放 5 個按鈕）
    const catRow = new ActionRowBuilder<ButtonBuilder>();

    // 首按鈕：返回總覽（若當前在大類頁）或顯示為「總覽」
    const isAll = opts.category === 'all';
    const homeBtn = new ButtonBuilder()
      .setCustomId(`${HELP_BUTTON_PREFIX}:cat:all:1:${opts.userId}`)
      .setLabel('總覽')
      .setStyle(isAll ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(isAll);

    catRow.addComponents(homeBtn);

    // 動態放其他可展開的大類按鈕（過濾掉無子指令的單一指令，如 ping、role_divider）
    const expandableCategories = opts.categories.filter((cat) => cat.items.some((item) => item.fullName !== `/${cat.name}`));

    const otherCats = expandableCategories.slice(0, 4);
    for (const cat of otherCats) {
      const isCurrent = opts.category.toLowerCase() === cat.name.toLowerCase();
      const catBtn = new ButtonBuilder()
        .setCustomId(`${HELP_BUTTON_PREFIX}:cat:${cat.name}:1:${opts.userId}`)
        .setLabel(cat.name)
        .setStyle(isCurrent ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isCurrent);

      catRow.addComponents(catBtn);
    }

    rows.push(catRow);

    return rows;
  }

  /**
   * 解析 CustomId：`help:action:category:targetPage:userId`
   */
  private parseCustomId(customId: string): IHelpButtonParams | null {
    const parts = customId.split(':');
    if (parts.length < 5 || parts[0] !== HELP_BUTTON_PREFIX) {
      return null;
    }

    return {
      prefix: parts[0],
      action: parts[1] as 'cat' | 'page',
      category: parts[2],
      targetPage: parseInt(parts[3], 10) || 1,
      userId: parts[4],
    };
  }
}

// 導出服務單例
export const helpService = new HelpService();
