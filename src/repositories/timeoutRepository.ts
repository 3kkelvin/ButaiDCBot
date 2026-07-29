import { supabase } from '../utils/db';
import {
  ITimeoutGlobalAdminRole,
  ITimeoutSingleAdminRole,
} from '../models/db/timeout/adminRole';
import { ITimeoutPrisoner } from '../models/db/timeout/prisoner';
import { ITimeoutGlobalJail } from '../models/db/timeout/globalJail';
import { ITimeoutSetting } from '../models/db/timeout/setting';

/**
 * /timeout 資料存取層 (DAL)
 */
export class TimeoutRepository {
  /**
   * 全域管理員身分組 (Global Admin)
   */
  async getGlobalAdminRoles(guildId: string): Promise<ITimeoutGlobalAdminRole[]> {
    const { data, error } = await supabase
      .from('timeout_global_admin_roles')
      .select('*')
      .eq('guild_id', guildId);

    if (error) throw error;
    return (data || []) as ITimeoutGlobalAdminRole[];
  }

  async addGlobalAdminRole(guildId: string, roleId: string): Promise<ITimeoutGlobalAdminRole> {
    const { data, error } = await supabase
      .from('timeout_global_admin_roles')
      .insert({ guild_id: guildId, role_id: roleId })
      .select()
      .single();

    if (error) throw error;
    return data as ITimeoutGlobalAdminRole;
  }

  async removeGlobalAdminRole(guildId: string, roleId: string): Promise<boolean> {
    const { error } = await supabase
      .from('timeout_global_admin_roles')
      .delete()
      .eq('guild_id', guildId)
      .eq('role_id', roleId);

    if (error) throw error;
    return true;
  }

  /**
   * 單頻道管理員身分組 (Single Admin)
   */
  async getSingleAdminRoles(guildId: string, channelId?: string): Promise<ITimeoutSingleAdminRole[]> {
    let query = supabase.from('timeout_single_admin_roles').select('*').eq('guild_id', guildId);
    if (channelId) {
      query = query.eq('channel_id', channelId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ITimeoutSingleAdminRole[];
  }

  async addSingleAdminRole(
    guildId: string,
    channelId: string,
    roleId: string
  ): Promise<ITimeoutSingleAdminRole> {
    const { data, error } = await supabase
      .from('timeout_single_admin_roles')
      .insert({ guild_id: guildId, channel_id: channelId, role_id: roleId })
      .select()
      .single();

    if (error) throw error;
    return data as ITimeoutSingleAdminRole;
  }

  async removeSingleAdminRole(
    guildId: string,
    channelId: string,
    roleId: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('timeout_single_admin_roles')
      .delete()
      .eq('guild_id', guildId)
      .eq('channel_id', channelId)
      .eq('role_id', roleId);

    if (error) throw error;
    return true;
  }

  /**
   * 單頻道禁言紀錄 (Prisoners)
   */
  async getPrisoners(guildId: string, channelId?: string): Promise<ITimeoutPrisoner[]> {
    let query = supabase.from('timeout_prisoners').select('*').eq('guild_id', guildId);
    if (channelId) {
      query = query.eq('channel_id', channelId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ITimeoutPrisoner[];
  }

  async findPrisoner(
    guildId: string,
    channelId: string,
    userId: string
  ): Promise<ITimeoutPrisoner | null> {
    const { data, error } = await supabase
      .from('timeout_prisoners')
      .select('*')
      .eq('guild_id', guildId)
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as ITimeoutPrisoner;
  }

  async addPrisoner(
    prisoner: Omit<ITimeoutPrisoner, 'id' | 'created_at'>
  ): Promise<ITimeoutPrisoner> {
    const { data, error } = await supabase
      .from('timeout_prisoners')
      .insert(prisoner)
      .select()
      .single();

    if (error) throw error;
    return data as ITimeoutPrisoner;
  }

  async removePrisoner(guildId: string, channelId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('timeout_prisoners')
      .delete()
      .eq('guild_id', guildId)
      .eq('channel_id', channelId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }

  async getExpiredPrisoners(): Promise<ITimeoutPrisoner[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('timeout_prisoners')
      .select('*')
      .lte('release_at', nowIso);

    if (error) throw error;
    return (data || []) as ITimeoutPrisoner[];
  }

  /**
   * 全服監獄紀錄 (Global Jail)
   */
  async getGlobalJails(guildId: string): Promise<ITimeoutGlobalJail[]> {
    const { data, error } = await supabase
      .from('timeout_global_jail')
      .select('*')
      .eq('guild_id', guildId);

    if (error) throw error;
    return (data || []) as ITimeoutGlobalJail[];
  }

  async findGlobalJail(guildId: string, userId: string): Promise<ITimeoutGlobalJail | null> {
    const { data, error } = await supabase
      .from('timeout_global_jail')
      .select('*')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as ITimeoutGlobalJail;
  }

  async addGlobalJail(
    jail: Omit<ITimeoutGlobalJail, 'id' | 'created_at'>
  ): Promise<ITimeoutGlobalJail> {
    const { data, error } = await supabase
      .from('timeout_global_jail')
      .insert(jail)
      .select()
      .single();

    if (error) throw error;
    return data as ITimeoutGlobalJail;
  }

  async removeGlobalJail(guildId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('timeout_global_jail')
      .delete()
      .eq('guild_id', guildId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }

  async getExpiredGlobalJails(): Promise<ITimeoutGlobalJail[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('timeout_global_jail')
      .select('*')
      .lte('release_at', nowIso);

    if (error) throw error;
    return (data || []) as ITimeoutGlobalJail[];
  }

  /**
   * 伺服器 Setting 設定
   */
  async getSetting(guildId: string): Promise<ITimeoutSetting | null> {
    const { data, error } = await supabase
      .from('timeout_settings')
      .select('*')
      .eq('guild_id', guildId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as ITimeoutSetting;
  }

  async upsertSetting(
    guildId: string,
    setting: Partial<Omit<ITimeoutSetting, 'guild_id' | 'created_at'>>
  ): Promise<ITimeoutSetting> {
    const existing = await this.getSetting(guildId);
    const payload = {
      guild_id: guildId,
      single_limit_minutes: setting.single_limit_minutes ?? existing?.single_limit_minutes ?? 600,
      global_limit_minutes: setting.global_limit_minutes ?? existing?.global_limit_minutes ?? 10080,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('timeout_settings')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return data as ITimeoutSetting;
  }
}

export default new TimeoutRepository();
