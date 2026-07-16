export interface IPingResponse {
  message: string;
  latency: number;
  timestamp: string;
}

export class PingService {
  /**
   * 獲取 Ping 指令的回覆資料
   * @param wsPing Discord Client Websocket 延遲 (毫秒)
   */
  async getPongMessage(wsPing: number): Promise<IPingResponse> {
    // 這裡可以處理任何複雜的業務運算，目前僅為簡單的 Pong 回覆與延遲獲取
    const latency = wsPing < 0 ? 0 : wsPing;
    return {
      message: 'Pong!',
      latency: latency,
      timestamp: new Date().toISOString(),
    };
  }
}

// 導出單例
export const pingService = new PingService();
