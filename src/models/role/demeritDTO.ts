import { Role } from 'discord.js';
import { ISocialCreditLog } from '../db/socialCreditLog';

/**
 * 管理員加減分/記點處分執行結果 DTO
 */
export interface IDemeritDTO {
  /** 寫入資料庫的記點異動日誌實體 */
  log: ISocialCreditLog;

  /** 處分異動後該成員的即時最新總分數 */
  newScore: number;

  /** 當總點數 <= 0 時被自動解任拔除的管理身分組列表 */
  removedRoles: Role[];
}
