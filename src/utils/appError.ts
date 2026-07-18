/**
 * 自定義全域錯誤類別
 * 擴充了原生 Error，讓它能攜帶 statusCode
 * 用於在業務邏輯層中拋出可預期的異常
 */
export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
