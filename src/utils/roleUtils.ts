/**
 * 身分組相關通用工具
 */
export class RoleUtils {
  /**
   * 裝飾身分組（分隔線身分組）判定關鍵字
   */
  private static readonly DIVIDER_CONTAINS = ['[', ']'];

  /**
   * 判斷指定的身分組名稱是否為裝飾/分隔用身分組
   * 規則：名稱同時包含 '[' 與 ']'
   * 
   * @param roleName 身分組名稱
   */
  public static isDividerRole(roleName: string): boolean {
    return RoleUtils.DIVIDER_CONTAINS.every((char) => roleName.includes(char));
  }
}
