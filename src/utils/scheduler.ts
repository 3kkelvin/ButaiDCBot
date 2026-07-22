import cron from 'node-cron';
import { DiscordLogger } from './discordLogger';

/**
 * 任務配置介面
 */
interface JobConfig {
  name: string;      // 任務名稱 (用於日誌)
  cron: string;      // Cron 表達式
  action: () => Promise<void>; // 執行的動作
}

/**
 * 所有背景排程任務的配置處
 */
const jobs: JobConfig[] = [
  // 未來如有其他背景定時任務，可在此註冊
];

/**
 * 初始化排程系統
 */
export const initSchedulers = () => {
  console.log('⏰ [Scheduler] 正在初始化背景排程任務...');

  if (jobs.length === 0) {
    console.log('ℹ️ [Scheduler] 無需要執行的 Cron 排程任務');
    return;
  }

  jobs.forEach((job) => {
    cron.schedule(job.cron, async () => {
      const startTime = new Date();
      console.log(`[Scheduler] [${startTime.toISOString()}] 開始執行排程任務: ${job.name}`);
      
      try {
        await job.action();
        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();
        console.log(`[Scheduler] [${endTime.toISOString()}] 排程任務執行完畢: ${job.name} (${duration}ms)`);
      } catch (error: any) {
        console.error(`[Scheduler] [${new Date().toISOString()}] 排程任務執行錯誤: ${job.name}`, error);
        
        // 背景排程為頂層 Entry Point，必須捕獲錯誤並發送 Discord Webhook 報警
        await DiscordLogger.sendErrorLog({
          message: `Scheduled Job Failed: ${job.name}. Error: ${error.message}`,
          errorName: error.name || 'SchedulerError',
          stack: error.stack,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'local',
        });
      }
    });
  });

  console.log(`✅ [Scheduler] 背景排程初始化成功，共載入 ${jobs.length} 個任務。`);
};
