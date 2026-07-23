/**
 * 負責自動化映射每個指令到/help指令底下而不用手動更新
 */
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { pingCommand } from '../controllers/pingCommand';
import { helpCommand } from '../controllers/helpCommand';
import { roleDividerCommand } from '../controllers/roleDividerCommand';
import { roleCommand } from '../controllers/roleCommand';


/**
 * 系統 Slash 指令通用介面
 */
export interface ICommand {
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | any;
  skipAuditLog?: boolean; // 允許指令自行設定是否略過 Webhook 指令審計記錄
  annotations?: string[]; // 指令層級的自訂註解
  subcommandsMetadata?: Record<string, {
    annotations?: string[]; // 子指令層級的自訂註解
  }>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// 收集本專案所有的指令單例
export const commandsList: ICommand[] = [
  pingCommand as ICommand,
  helpCommand as ICommand,
  roleDividerCommand as ICommand,
  roleCommand as ICommand,
];

// 將指令轉化為以 name 為 Key 的 Map，方便 bot.ts 查詢路由
export const commandsMap = new Map<string, ICommand>();
for (const cmd of commandsList) {
  commandsMap.set(cmd.data.name, cmd);
}
