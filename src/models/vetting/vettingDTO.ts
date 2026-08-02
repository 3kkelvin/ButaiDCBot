/**
 * 審核類型
 * official: 正式成員審核
 * voter: 選民審核
 */
export type VettingType = 'official' | 'voter';

/**
 * 審核單據資料介面
 */
export interface IVettingRecord {
  /** 討論串 ID */
  threadId: string;
  /** 伺服器 ID */
  guildId: string;
  /** 被審核成員 User ID */
  targetUserId: string;
  /** 審核類型 */
  type: VettingType;
  /** 按下「通過」的審核員 User ID 列表 */
  approvers: string[];
  /** 按下「拒絕」的審核員 User ID 列表 */
  rejecters: string[];
  /** 目前計算總分數 (approvers.length - rejecters.length) */
  score: number;
  /** 所需通過票數 */
  requiredApprovals: number;
  /** 建立時間 */
  createdAt: number;
  /** 到期時間 */
  expireAt: number;
}

/**
 * 按鈕 CustomId 前綴
 */
export const VETTING_BUTTON_PREFIX = 'vetting';

/**
 * 按鈕動作類型
 */
export type VettingButtonAction = 'approve' | 'reject';
