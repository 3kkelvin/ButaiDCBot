import { supabase } from '../utils/db';

/**
 * 基礎 Repository 類別 (Postgres Supabase 版)
 * 提供通用的 Supabase CRUD 操作方法，隔離 Service 與 Supabase Client
 */
export abstract class BaseRepository<T> {
  protected tableName: string;
  protected primaryKeyName: string;

  constructor(tableName: string, primaryKeyName: string = 'id') {
    this.tableName = tableName;
    this.primaryKeyName = primaryKeyName;
  }

  /**
   * 根據主鍵查詢單一紀錄
   */
  async findById(id: string | number): Promise<T | null> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq(this.primaryKeyName, id)
      .single();

    if (error) {
      // PGRST116 為 PostgREST 的 "The query returned 0 rows" 找不到資料錯誤碼
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    return data as T;
  }

  /**
   * 根據簡單條件過濾查詢多筆紀錄
   */
  async find(filter?: any): Promise<T[]> {
    let query = supabase.from(this.tableName).select('*');

    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return (data || []) as T[];
  }

  /**
   * 寫入一筆紀錄
   */
  async create(data: any): Promise<T> {
    const { data: inserted, error } = await supabase
      .from(this.tableName)
      .insert(data)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return inserted as T;
  }

  /**
   * 根據主鍵更新特定紀錄
   */
  async update(id: string | number, data: any): Promise<T | null> {
    const { data: updated, error } = await supabase
      .from(this.tableName)
      .update(data)
      .eq(this.primaryKeyName, id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return updated as T;
  }

  /**
   * 根據主鍵刪除特定紀錄
   */
  async delete(id: string | number): Promise<boolean> {
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .eq(this.primaryKeyName, id);

    if (error) {
      throw error;
    }
    return true;
  }
}
