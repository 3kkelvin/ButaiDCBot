import { BaseRepository } from './baseRepository';
import { IThreadSetting } from '../models/db/threadSetting';
import { supabase } from '../utils/db';

/**
 * 討論串/貼文城堡法設定資料存取層 (DAL)
 * 職責專一：純粹負責 Supabase PostgreSQL public.thread_settings 表之 CRUD 操作
 */
export class ThreadRepository extends BaseRepository<IThreadSetting> {
  constructor() {
    super('thread_settings', 'thread_id');
  }

  /**
   * 取得指定討論串的 Supabase 設定紀錄
   */
  async getThreadSetting(threadId: string): Promise<IThreadSetting | null> {
    return this.findById(threadId);
  }

  /**
   * 取得全伺服器所有曾經設定過城堡法之討論串 Snowflake ID 清單 (供冷啟動預熱呼叫)
   */
  async getAllThreadIds(): Promise<string[]> {
    const { data, error } = await supabase.from(this.tableName).select('thread_id');

    if (error) {
      console.error('[ThreadRepository] 讀取 Supabase 城堡法列表失敗：', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((item) => item.thread_id);
  }

  /**
   * 新增或更新討論串設定紀錄
   */
  async upsertThreadSetting(
    payload: Partial<IThreadSetting> & { thread_id: string; guild_id: string; owner_id: string }
  ): Promise<IThreadSetting> {
    const existing = await this.getThreadSetting(payload.thread_id);

    const dataToSave = {
      thread_id: payload.thread_id,
      guild_id: payload.guild_id,
      owner_id: payload.owner_id || existing?.owner_id || '',
      is_locked: payload.is_locked ?? existing?.is_locked ?? false,
      coworker_ids: payload.coworker_ids ?? existing?.coworker_ids ?? [],
      blacklist_ids: payload.blacklist_ids ?? existing?.blacklist_ids ?? [],
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(this.tableName)
      .upsert(dataToSave)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as IThreadSetting;
  }

  /**
   * 新增協作者
   */
  async addCoworker(
    threadId: string,
    guildId: string,
    ownerId: string,
    userId: string
  ): Promise<IThreadSetting> {
    const setting = await this.getThreadSetting(threadId);
    const coworkers = new Set(setting?.coworker_ids || []);
    coworkers.add(userId);

    return this.upsertThreadSetting({
      thread_id: threadId,
      guild_id: guildId,
      owner_id: ownerId,
      coworker_ids: Array.from(coworkers),
    });
  }

  /**
   * 移除協作者
   */
  async removeCoworker(threadId: string, userId: string): Promise<IThreadSetting | null> {
    const setting = await this.getThreadSetting(threadId);
    if (!setting) return null;

    const coworkers = (setting.coworker_ids || []).filter((id) => id !== userId);
    return this.upsertThreadSetting({
      thread_id: threadId,
      guild_id: setting.guild_id,
      owner_id: setting.owner_id,
      coworker_ids: coworkers,
    });
  }

  /**
   * 新增黑名單成員
   */
  async addBlacklist(
    threadId: string,
    guildId: string,
    ownerId: string,
    userId: string
  ): Promise<IThreadSetting> {
    const setting = await this.getThreadSetting(threadId);
    const blacklist = new Set(setting?.blacklist_ids || []);
    blacklist.add(userId);

    return this.upsertThreadSetting({
      thread_id: threadId,
      guild_id: guildId,
      owner_id: ownerId,
      blacklist_ids: Array.from(blacklist),
    });
  }

  /**
   * 移除黑名單成員
   */
  async removeBlacklist(threadId: string, userId: string): Promise<IThreadSetting | null> {
    const setting = await this.getThreadSetting(threadId);
    if (!setting) return null;

    const blacklist = (setting.blacklist_ids || []).filter((id) => id !== userId);
    return this.upsertThreadSetting({
      thread_id: threadId,
      guild_id: setting.guild_id,
      owner_id: setting.owner_id,
      blacklist_ids: blacklist,
    });
  }

  /**
   * 設定帖子鎖定狀態
   */
  async setLockStatus(
    threadId: string,
    guildId: string,
    ownerId: string,
    isLocked: boolean
  ): Promise<IThreadSetting> {
    return this.upsertThreadSetting({
      thread_id: threadId,
      guild_id: guildId,
      owner_id: ownerId,
      is_locked: isLocked,
    });
  }
}

export const threadRepository = new ThreadRepository();
export default threadRepository;
