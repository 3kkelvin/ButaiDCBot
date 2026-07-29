import { BaseRepository } from './baseRepository';
import { supabase } from '../utils/db';
import { ISocialCreditLog } from '../models/db/socialCreditLog';

/**
 * 公務員計點日誌資料存取層 (DAL)
 */
export class SocialCreditRepository extends BaseRepository<ISocialCreditLog> {
  constructor() {
    super('social_credit_logs', 'id');
  }

  /**
   * 新增一筆記點/加減分日誌
   */
  public async addLog(
    logData: Omit<ISocialCreditLog, 'id' | 'created_at' | 'deleted_at'>
  ): Promise<ISocialCreditLog> {
    return await this.create(logData);
  }

  /**
   * 取得指定成員在該伺服器的所有有效加減分日誌 (依建立時間降冪排序，排除軟刪除)
   */
  public async getLogsByUser(guildId: string, targetUserId: string): Promise<ISocialCreditLog[]> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('guild_id', guildId)
      .eq('target_user_id', targetUserId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }
    return (data || []) as ISocialCreditLog[];
  }

  /**
   * 批次取得指定多名成員在該伺服器的所有有效加減分日誌 (排除軟刪除)
   */
  public async getLogsByUsers(
    guildId: string,
    targetUserIds: string[]
  ): Promise<ISocialCreditLog[]> {
    if (targetUserIds.length === 0) return [];

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('guild_id', guildId)
      .in('target_user_id', targetUserIds)
      .is('deleted_at', null);

    if (error) {
      throw error;
    }
    return (data || []) as ISocialCreditLog[];
  }

  /**
   * 軟刪除 (Soft Delete) 指定伺服器的所有計點紀錄 (保留 Audit Trail)
   */
  public async softDeleteGuildLogs(guildId: string): Promise<boolean> {
    const { error } = await supabase
      .from(this.tableName)
      .update({ deleted_at: new Date().toISOString() })
      .eq('guild_id', guildId)
      .is('deleted_at', null);

    if (error) {
      throw error;
    }
    return true;
  }
}

export default new SocialCreditRepository();
