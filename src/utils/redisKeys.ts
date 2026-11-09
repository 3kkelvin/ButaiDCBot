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
    /** /timeout 禁言操作鎖 (單頻道) */
    timeoutJail: (guildId: string, channelId: string, userId: string) => `timeout:jail:${guildId}:${channelId}:${userId}`,
    /** /timeout 解禁操作鎖 (單頻道) */
    timeoutRelease: (guildId: string, channelId: string, userId: string) => `timeout:release:${guildId}:${channelId}:${userId}`,
    /** /timeout 全服監獄關押鎖 */
    timeoutGlobalJail: (guildId: string, userId: string) => `timeout:global_jail:${guildId}:${userId}`,
    /** /timeout 全服監獄釋放鎖 */
    timeoutGlobalRelease: (guildId: string, userId: string) => `timeout:global_release:${guildId}:${userId}`,
    /** /timeout 背景自動掃描鎖 */
    timeoutScan: () => 'timeout:scan',
    /** 審核身份驗證操作鎖 */
    vettingUser: (userId: string) => `vetting:user:${userId}`,
    /** 身分組清洗操作鎖 */
    clearRole: (guildId: string, roleId: string) => `clear_role:${guildId}:${roleId}`,
    /** 工單建立防連點鎖 */
    ticketCreate: (userId: string) => `ticket_create:${userId}`,
    /** 工單關閉互斥鎖 */
    ticketClose: (threadId: string) => `ticket_close:${threadId}`,
    /** 論壇新帖發起投票與通知互斥鎖 */
    forumPollThread: (threadId: string) => `forum_poll_thread:${threadId}`,
    /** 歡迎訊息打招呼防連點鎖 */
    welcomeGreet: (userId: string) => `welcome_greet:${userId}`,
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
    /** 審核討論串單據快取 Key */
    vettingRecord: (threadId: string) => `vetting:record:${threadId}`,
    /** 討論串城堡法設定快取 Key */
    threadSetting: (threadId: string) => `thread_setting:${threadId}`,
    /** 討論串城堡法全域有值白名單 Set Key */
    activeCastleThreadsSet: () => 'active_castle_threads',
    /** 論壇發帖投票與通知配置 Key */
    forumPollConfig: (forumId: string) => `forum_poll:config:${forumId}`,
    /** 論壇通知用戶永不打擾 Key */
    forumPollOptOut: (userId: string) => `forum_poll:optout:${userId}`,
    /** 伺服器歡迎訊息配置 Key */
    welcomeConfig: (guildId: string) => `welcome:config:${guildId}`,
    /** 工單面板與身分組配置 Key */
    ticketConfig: (guildId: string, channelId: string) => `ticket:config:${guildId}:${channelId}`,
    /** 工單私人子區記錄 Key */
    ticketThread: (threadId: string) => `ticket:thread:${threadId}`,
  },

  /**
   * 快取類別 (Category) 命名空間
   */
  Category: {
    /** 討論串城堡法設定類別 */
    threadSetting: 'thread_setting',
  },

  /**
   * 資料持久結構命名空間 (Lists / Sets / Sorted Sets)
   */
  Data: {
    /** 待自動刪除的歡迎訊息 Sorted Set Key */
    welcomePendingDeletions: () => 'welcome:pending_deletions',
  },
};
