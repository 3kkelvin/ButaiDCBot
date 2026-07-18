/**
 * Supabase Client 初始化模組
 * 
 * 負責載入 SUPABASE_URL 與 SUPABASE_KEY 環境變數，
 * 建立與 Supabase (PostgreSQL) 的連線單例並導出，供資料存取層 (DAL/Repository) 複用。
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Warning: SUPABASE_URL or SUPABASE_KEY is missing. Database operations will fail.');
}

// 建立並導出全域 Supabase 單例實例
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
