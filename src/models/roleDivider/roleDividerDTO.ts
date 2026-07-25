/**
 * 單一成員身分組分隔線修復結果 DTO
 */
export interface IRoleDividerDTO {
  /** 補排新增的裝飾分隔身分組名稱列表 */
  addedRoles: string[];

  /** 拔除收回的多餘裝飾分隔身分組名稱列表 */
  removedRoles: string[];
}

/**
 * 全伺服器身分組分隔線修復結果 DTO
 */
export interface IFixAllMembersDTO {
  /** 伺服器總成員數量 (含機器人) */
  totalMembers: number;

  /** 已處理的真人成員數量 */
  processedMembers: number;

  /** 身分組有發生增減異動的成員數量 */
  updatedMembers: number;
}
