/**
 * 全專案 Redis 快取 (Cache) 與分散式鎖 (Lock) Key 集中管理中心
 * 
 * 規範：所有新的快取或分散式鎖 Key，必須在此檔進行宣告，嚴禁在業務程式碼中硬編碼字串！
 */
export const RedisKeys = {
  /**
   * 分散式鎖 (Lock Keys) 命名空間
   * 注意：LockRepository 底層會自動補上 "lock:" 前綴，故此處回傳之 Key 名稱不需手動加 "lock:"。
   */
  Lock: {
    /** /ping 指令測試分散式鎖 */
    pingTest: () => 'ping_test',
    /** 身分組分隔線全服修復鎖 */
    roleDividerFix: (guildId: string) => `role_divider_fix:${guildId}`,
    /** 身分層級核對檢查鎖 */
    identityCheck: (guildId: string) => `identity_check:${guildId}`,
  },

  /**
   * 快取 (Cache Keys) 命名空間
   */
  Cache: {
    /** DB / Redis 連線驗證測試快取 Key */
    pingDbTest: () => 'db_ping_test_key',
    /** CacheService 驗證測試快取 Key */
    pingServiceVerify: () => 'test_cache_service_key',
    /** 伺服器 RoleDivider 配置快取 Key */
    roleDividerConfig: (guildId: string) => `role_divider:config:${guildId}`,
  },
};
