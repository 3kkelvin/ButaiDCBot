/**
 * 手動身分組給予/移除權限對照規則型別介面
 */
export interface ManualRoleRule {
  /** 執行者擁有的授權身分組 ID (Operator Role) */
  operatorRoleId: string;

  /** 該執行者被授權可手動給予/移除的目標身分組 ID 陣列 (Target Roles) */
  allowedRoleIds: string[];

  /** 規則備註與描述說明 (選擇性) */
  description?: string;
}

/**
 * 手動身分組操作結果 DTO 型別介面
 */
export interface IManualRoleResultDTO {
  /** 操作行為類別：'give' (給予) 或 'remove' (移除) */
  action: 'give' | 'remove';

  /** 執行指令者 (Operator) 的 Discord User ID */
  executorId: string;

  /** 被給予或移除身分組之目標成員 (Target Member) 的 Discord User ID */
  targetMemberId: string;

  /** 被操作之目標身分組 ID */
  roleId: string;

  /** 被操作之目標身分組名稱 */
  roleName: string;

  /** 操作是否執行成功 */
  success: boolean;

  /** 執行結果之說明或提示訊息 */
  message: string;
}
