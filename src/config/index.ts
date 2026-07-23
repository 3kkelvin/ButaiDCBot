import { devConfig } from './dev';
import { mainConfig } from './main';

/**
 * 系統通用配置型別介面
 */
export type AppConfig = typeof devConfig;

const isProduction = process.env.NODE_ENV === 'main';

/**
 * 依據環境自動分發的配置單例
 */
export const config: AppConfig = isProduction ? mainConfig : devConfig;
