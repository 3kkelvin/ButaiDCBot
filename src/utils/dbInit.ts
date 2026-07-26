/**
 * 資料庫自動建表與遷移模組 (Auto-Migration)
 * 
 * 負責在開機啟動的第一時間，讀取 database/schemas/ 目錄下各個獨立的 SQL Schema 檔案，
 * 連線至 PostgreSQL 執行建表與索引配置，實現完全零手動的自動建表機制。
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

/**
 * 執行資料表結構自動初始化
 */
export const initializeDatabase = async (): Promise<void> => {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.warn('⚠️ [DbInit] 警告: 缺少 DATABASE_URL 環境變數，跳過資料庫自動建表偵測。');
    return;
  }

  // 實例化 Postgres 客戶端 (若是 Supabase 則自動開啟 SSL 連線)
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('supabase') 
      ? { rejectUnauthorized: false } 
      : undefined,
  });

  try {
    await client.connect();
    console.log('🔌 [DbInit] 成功連接至 PostgreSQL，開始偵測資料表結構...');

    // 定位 schema 檔案目錄 (根目錄下的 database/schemas)
    const schemasDir = path.join(process.cwd(), 'database', 'schemas');
    if (!fs.existsSync(schemasDir)) {
      console.warn(`⚠️ [DbInit] 找不到 Schema 目錄: ${schemasDir}，跳過建表。`);
      return;
    }

    // 讀取所有 .sql 檔案
    const sqlFiles = fs.readdirSync(schemasDir).filter(file => file.endsWith('.sql'));
    
    for (const file of sqlFiles) {
      const filePath = path.join(schemasDir, file);
      console.log(`⏳ [DbInit] 正在執行自動建表遷移: ${file}...`);
      
      const sqlContent = fs.readFileSync(filePath, 'utf-8');
      
      // 執行 DDL 建表
      await client.query(sqlContent);
    }
    
    console.log('✅ [DbInit] 資料庫 Tables 自動建立與偵測完畢！');
  } catch (error: any) {
    console.error('❌ [DbInit] 資料表自動初始化失敗，請檢查 DATABASE_URL 或 SQL 語法：', error.message);
    throw error; // 向上拋出以利 Bot 啟動攔截
  } finally {
    // 釋放 DDL 客戶端連線，釋放連線池
    await client.end().catch(() => {});
  }
};
