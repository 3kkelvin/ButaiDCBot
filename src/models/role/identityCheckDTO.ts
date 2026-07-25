/**
 * 全伺服器身分組層級核對結果 DTO
 */
export interface IIdentityCheckDTO {
  /** 伺服器總成員數量 (含機器人) */
  totalMembers: number;

  /** 已處理的真人成員數量 */
  processedMembers: number;

  /** 自動給予「臨時成員」身分組的人數 */
  addedTemporaryCount: number;

  /** 修正多重 5 大身分組衝突的人數 */
  conflictResolvedCount: number;
}
